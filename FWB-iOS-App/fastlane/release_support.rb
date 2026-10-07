require "base64"
require "fileutils"
require "json"
require "net/http"
require "open3"
require "openssl"
require "securerandom"
require "shellwords"
require "uri"

# Shared, independently testable release checks. Never interpolate credentials
# into shell commands, write them to the checkout, or include them in errors.
module FWBRelease
  APP_ID = "com.benjaminbenz.fwbcoach".freeze
  TEAM_ID = "5Q4FU299QH".freeze
  RELEASE_REPOSITORY = "fitnessgayz/benjaminbenz".freeze
  TESTFLIGHT_GROUP = "FWB Coach Beta".freeze
  TESTFLIGHT_PROCESSING_TIMEOUT = 3_600
  def self.validate_app_boundary!(app_directory)
    root = File.read(File.join(app_directory, "FWBCoach", "CoachAppView.swift"))
    configuration = File.read(File.join(app_directory, "FWBCoach", "AppConfiguration.swift"))
    unless root.include?("CoachRootView(") && !root.include?("ClientRootView(") &&
        configuration.include?("requiredAccountRole: AccountRole = .coach")
      raise "The coach release must have a coach-only entry point and server-verified coach access."
    end
    if File.exist?(File.join(app_directory, "FWBCoach", "ClientNavigationView.swift"))
      raise "The client native navigation shell belongs in fitnessgayz/fwb-ios, not the coach release."
    end
  end

  REQUIRED = %w[
    ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY_P8_BASE64
    IOS_DISTRIBUTION_P12_BASE64 IOS_DISTRIBUTION_P12_PASSWORD
    IOS_PROVISIONING_PROFILE_BASE64 SENTRY_AUTH_TOKEN
    SENTRY_DSN SENTRY_ORG SENTRY_PROJECT
  ].freeze

  def self.validate_internal_beta_group!(groups)
    group = groups.find { |item| item.name == TESTFLIGHT_GROUP }
    raise "Create the #{TESTFLIGHT_GROUP} internal TestFlight group in App Store Connect." unless group
    raise "#{TESTFLIGHT_GROUP} must be an internal group." unless group.is_internal_group == true
    unless group.has_access_to_all_builds == true
      raise "Enable automatic distribution for #{TESTFLIGHT_GROUP} in App Store Connect."
    end
    group
  end

  def self.testflight_distribution_options(build_number:, version:)
    {
      app_version: version,
      build_number: build_number,
      # Pilot updates beta metadata even with skip_submission. Return directly
      # after upload, then use the read-only watcher below for internal builds.
      skip_waiting_for_build_processing: true,
      distribute_external: false,
      submit_beta_review: false,
      skip_submission: true,
      wait_processing_interval: 30,
      wait_processing_timeout_duration: TESTFLIGHT_PROCESSING_TIMEOUT
    }
  end

  def self.wait_for_internal_build!(watcher:, app_id:, build_number:, version:)
    build = watcher.wait_for_build_processing_to_be_complete(
      app_id: app_id, platform: "IOS", app_version: version,
      build_version: build_number, poll_interval: 30,
      timeout_duration: TESTFLIGHT_PROCESSING_TIMEOUT,
      return_spaceship_testflight_build: false, select_latest: false,
      wait_for_build_beta_detail_processing: true
    )
    unless build && build.app_version == version && build.version == build_number && available_for_internal_testing?(build)
      raise "The exact uploaded coach build is not ready for internal TestFlight testing."
    end
    build
  end

  def self.available_for_internal_testing?(build)
    return true if build.ready_for_internal_testing?

    # Automatic internal distribution can advance a processed build directly
    # from READY_FOR_BETA_TESTING to IN_BETA_TESTING before this read-only
    # watcher evaluates it. Both states mean internal testers can install it.
    detail = build.respond_to?(:build_beta_detail) ? build.build_beta_detail : nil
    detail&.internal_build_state == "IN_BETA_TESTING"
  end

  def self.validate_configuration!(env = ENV)
    missing = REQUIRED.select { |name| env[name].to_s.strip.empty? }
    raise "Missing release configuration: #{missing.join(', ')}. See DEPLOYMENT.md." unless missing.empty?
    dsn = URI.parse(env.fetch("SENTRY_DSN"))
    unless dsn.scheme == "https" && dsn.host && dsn.user && dsn.path.match?(%r{\A/\d+\z}) && !dsn.password && !dsn.query && !dsn.fragment
      raise "SENTRY_DSN must be the project's HTTPS public DSN."
    end
    sentry_url = URI.parse(env.fetch("SENTRY_URL", "https://sentry.io"))
    raise "SENTRY_URL must use HTTPS." unless sentry_url.scheme == "https" && sentry_url.host && !sentry_url.userinfo
    %w[SENTRY_ORG SENTRY_PROJECT].each do |key|
      raise "#{key} must be a Sentry slug." unless env.fetch(key).match?(/\A[a-zA-Z0-9_-]+\z/)
    end
  rescue URI::InvalidURIError
    raise "Invalid Sentry URL configuration."
  end

  def self.require_trusted_main!(env = ENV)
    raise "Release requires GitHub Actions." unless env["GITHUB_ACTIONS"] == "true"
    raise "Release requires the approved repository." unless env["GITHUB_REPOSITORY"] == RELEASE_REPOSITORY
    raise "Release requires main." unless env["GITHUB_REF"] == "refs/heads/main"
    unless %w[push workflow_dispatch].include?(env["GITHUB_EVENT_NAME"])
      raise "Release only runs for a push or manual dispatch."
    end
  end

  def self.build_ordinal(value)
    parts = value.to_s.split(".")
    unless (1..3).cover?(parts.length) && parts.all? { |part| part.match?(/\A\d+\z/) }
      raise "App Store Connect returned an unsupported build number."
    end
    parts = parts.map(&:to_i)
    parts << 0 while parts.length < 3
    raise "Build number exceeds Apple's component limits." unless parts[0] <= 9999 && parts[1..2].all? { |part| part <= 99 }
    parts[0] * 10_000 + parts[1] * 100 + parts[2]
  end

  def self.next_build_number(latest:, run_number:, run_attempt:)
    run = Integer(run_number)
    attempt = Integer(run_attempt)
    raise "Invalid GitHub run number or attempt." unless run.positive? && (1..99).cover?(attempt)
    # A new run or retry has a distinct baseline even while ASC processes the
    # previous upload. A separate coach epoch also exceeds the old client
    # pipeline's 1037.x builds while the bundle ownership migration settles.
    # The ASC comparison accommodates manual releases.
    ordinal = [(2_000 + run) * 10_000 + attempt * 100, build_ordinal(latest) + 1].max
    raise "Build number space exhausted; update the release numbering strategy." if ordinal > 99_999_999
    [ordinal / 10_000, (ordinal / 100) % 100, ordinal % 100].join(".")
  end

  def self.decode_secret!(env, name, path)
    bytes = Base64.strict_decode64(env.fetch(name).gsub(/\s/, ""))
    raise ArgumentError if bytes.empty?
    File.write(path, bytes, mode: "wb", perm: 0o600)
    path
  rescue ArgumentError
    raise "#{name} must contain valid base64 data."
  end

  def self.command!(*args)
    output, _errors, status = Open3.capture3(*args)
    raise "Release command failed: #{File.basename(args.first)}. Check signing credentials and DEPLOYMENT.md." unless status.success?
    output
  end

  class Signing
    attr_reader :keychain, :profile_uuid, :identity, :api_key_path

    def initialize(directory, env = ENV)
      @directory, @env = directory, env
      @keychain = File.join(directory, "release.keychain-db")
      @old_keychains = nil
      @profile_paths = []
      FileUtils.mkdir_p(directory, mode: 0o700)
    end

    def configure_project!(project)
      target = project.targets.find { |item| item.name == "FWBCoach" }
      raise "The coach app target is missing." unless target
      target.build_configurations.each do |configuration|
        settings = configuration.build_settings
        unless settings["PRODUCT_BUNDLE_IDENTIFIER"] == APP_ID
          raise "The coach release target must use #{APP_ID}."
        end
        # Device-specific overrides take precedence over generic settings. Never
        # let a stale local signing profile override the validated CI profile.
        settings.delete_if { |key, _| key.match?(/\A(?:CODE_SIGN_STYLE|CODE_SIGN_IDENTITY|DEVELOPMENT_TEAM|PROVISIONING_PROFILE(?:_SPECIFIER)?)(?:\[.*\])?\z/) }
        settings["DEVELOPMENT_TEAM"] = TEAM_ID
        settings["CODE_SIGN_STYLE"] = "Manual"
        settings["CODE_SIGN_IDENTITY"] = @identity
        settings["PROVISIONING_PROFILE_SPECIFIER"] = @profile_uuid
      end
    end

    def prepare!
      require "plist"
      @api_key_path = FWBRelease.decode_secret!(@env, "ASC_PRIVATE_KEY_P8_BASE64", File.join(@directory, "AuthKey.p8"))
      private_key = OpenSSL::PKey.read(File.read(@api_key_path))
      raise "ASC_PRIVATE_KEY_P8_BASE64 must be an EC private key." unless private_key.is_a?(OpenSSL::PKey::EC) && private_key.private?
      p12 = FWBRelease.decode_secret!(@env, "IOS_DISTRIBUTION_P12_BASE64", File.join(@directory, "distribution.p12"))
      mobileprovision = FWBRelease.decode_secret!(@env, "IOS_PROVISIONING_PROFILE_BASE64", File.join(@directory, "app.mobileprovision"))
      profile = Plist.parse_xml(FWBRelease.command!("security", "cms", "-D", "-i", mobileprovision))
      validate_profile!(profile)
      @profile_uuid = profile.fetch("UUID")
      raise "Invalid provisioning profile UUID." unless @profile_uuid.match?(/\A[0-9a-fA-F-]{36}\z/)
      # Import into a temporary keychain and give codesign access without any
      # interactive prompt. The user's/runner's default keychain is unchanged.
      password = SecureRandom.hex(32)
      @old_keychains = Shellwords.split(FWBRelease.command!("security", "list-keychains", "-d", "user"))
      FWBRelease.command!("security", "create-keychain", "-p", password, @keychain)
      FWBRelease.command!("security", "set-keychain-settings", "-lut", "7200", @keychain)
      FWBRelease.command!("security", "unlock-keychain", "-p", password, @keychain)
      FWBRelease.command!("security", "list-keychains", "-d", "user", "-s", @keychain, *@old_keychains)
      FWBRelease.command!("security", "import", p12, "-k", @keychain, "-P", @env.fetch("IOS_DISTRIBUTION_P12_PASSWORD"), "-T", "/usr/bin/codesign", "-T", "/usr/bin/security")
      FWBRelease.command!("security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", password, @keychain)
      identities = FWBRelease.command!("security", "find-identity", "-v", "-p", "codesigning", @keychain)
      hashes = profile.fetch("DeveloperCertificates").map { |cert| OpenSSL::Digest::SHA1.hexdigest(cert.respond_to?(:string) ? cert.string : cert).upcase }
      @identity = identities.scan(/([0-9A-F]{40}) "Apple Distribution:[^"]+"/).flatten.find { |hash| hashes.include?(hash) }
      raise "The P12 must contain the Apple Distribution private key matching this profile." unless @identity
      # Xcode 16+ uses UserData; the legacy directory supports earlier tooling.
      ["Library/Developer/Xcode/UserData/Provisioning Profiles", "Library/MobileDevice/Provisioning Profiles"].each do |subdir|
        destination = File.join(Dir.home, subdir, "#{@profile_uuid}.mobileprovision")
        raise "Unexpected pre-existing CI provisioning profile." if File.exist?(destination)
        FileUtils.mkdir_p(File.dirname(destination))
        @profile_paths << destination
        FileUtils.cp(mobileprovision, destination)
        File.chmod(0o600, destination)
      end
    rescue OpenSSL::PKey::PKeyError
      raise "ASC_PRIVATE_KEY_P8_BASE64 is not a valid private key."
    end

    def validate_profile!(profile)
      unless profile.is_a?(Hash) && profile.fetch("TeamIdentifier", []).include?(TEAM_ID)
        raise "Provisioning profile belongs to the wrong Apple Developer team."
      end
      entitlements = profile.fetch("Entitlements", {})
      unless entitlements["application-identifier"] == "#{TEAM_ID}.#{APP_ID}"
        raise "Provisioning profile does not match the FWB app identifier."
      end
      if profile.key?("ProvisionedDevices") || profile["ProvisionsAllDevices"] || entitlements["get-task-allow"] != false
        raise "Use an App Store Connect distribution profile, not a development or ad hoc profile."
      end
      raise "The distribution profile must enable HealthKit for FWB." unless entitlements["com.apple.developer.healthkit"] == true
      expiration = profile.fetch("ExpirationDate")
      expiration = expiration.to_time if expiration.respond_to?(:to_time)
      raise "Provisioning profile has expired or has an invalid expiry date." unless expiration.is_a?(Time) && expiration > Time.now
    end

    def cleanup
      @profile_paths.each { |path| FileUtils.rm_f(path) }
      Open3.capture3("security", "list-keychains", "-d", "user", "-s", *@old_keychains) if @old_keychains
      Open3.capture3("security", "delete-keychain", @keychain) if File.exist?(@keychain)
      FileUtils.rm_rf(@directory)
    end
  end
end
