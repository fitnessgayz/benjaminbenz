require "minitest/autorun"
require "tmpdir"
require_relative "release_support"

class ReleaseSupportTest < Minitest::Test
  def test_shipping_coach_boundary_is_valid
    FWBRelease.validate_app_boundary!(File.expand_path("..", __dir__))
  end

  def test_client_entry_point_is_refused_before_release
    Dir.mktmpdir do |directory|
      FileUtils.mkdir_p(File.join(directory, "FWBCoach"))
      File.write(File.join(directory, "FWBCoach", "CoachAppView.swift"), "ClientRootView(")
      File.write(File.join(directory, "FWBCoach", "AppConfiguration.swift"), "requiredAccountRole: AccountRole = .client")
      assert_raises(RuntimeError) { FWBRelease.validate_app_boundary!(directory) }
    end
  end

  def test_number_exceeds_previous_client_pipeline_build
    assert_equal "2001.1.0", FWBRelease.next_build_number(latest: "1037.1.0", run_number: 1, run_attempt: 1)
  end

  def test_internal_distribution_waits_for_exact_build_without_external_review
    options = FWBRelease.testflight_distribution_options(build_number: "100.42.1", version: "100.35.1")
    assert_equal "100.42.1", options.fetch(:build_number)
    assert_equal "100.35.1", options.fetch(:app_version)
    assert_equal false, options.fetch(:skip_waiting_for_build_processing)
    assert_equal false, options.fetch(:distribute_external)
    assert_equal false, options.fetch(:submit_beta_review)
    assert_equal true, options.fetch(:skip_submission)
    assert_equal 3_600, options.fetch(:wait_processing_timeout_duration)
    refute options.key?(:groups), "Apple assigns automatic internal groups; do not assign an external group."
  end

  def test_internal_group_must_have_automatic_distribution
    group = Struct.new(:name, :is_internal_group, :has_access_to_all_builds)
    valid = group.new(FWBRelease::TESTFLIGHT_GROUP, true, true)
    assert_same valid, FWBRelease.validate_internal_beta_group!([valid])
    [[], [group.new(FWBRelease::TESTFLIGHT_GROUP, false, true)], [group.new(FWBRelease::TESTFLIGHT_GROUP, true, false)]].each do |groups|
      assert_raises(RuntimeError) { FWBRelease.validate_internal_beta_group!(groups) }
    end
  end

  def test_signing_is_scoped_to_coach_target_and_rejects_client_bundle
    configuration = Struct.new(:build_settings)
    target = Struct.new(:name, :build_configurations)
    project = Struct.new(:targets)
    settings = {"PRODUCT_BUNDLE_IDENTIFIER" => FWBRelease::APP_ID}
    coach = target.new("FWBCoach", [configuration.new(settings)])
    unrelated_settings = {}
    unrelated = target.new("OtherTarget", [configuration.new(unrelated_settings)])
    Dir.mktmpdir do |dir|
      signing = FWBRelease::Signing.new(File.join(dir, "signing"), {})
      signing.configure_project!(project.new([coach, unrelated]))
      assert_equal "Manual", settings.fetch("CODE_SIGN_STYLE")
      assert_equal({}, unrelated_settings)
      settings["PRODUCT_BUNDLE_IDENTIFIER"] = "com.benjaminbenz.fwb"
      assert_raises(RuntimeError) { signing.configure_project!(project.new([coach])) }
      signing.cleanup
    end
  end

  def test_first_ci_build_exceeds_existing_build_eight
    assert_equal "2001.1.0", FWBRelease.next_build_number(latest: 8, run_number: 1, run_attempt: 1)
  end

  def test_retry_is_distinct_before_apple_finishes_processing
    assert_equal "2001.2.0", FWBRelease.next_build_number(latest: 8, run_number: 1, run_attempt: 2)
  end

  def test_remote_manual_release_takes_precedence
    assert_equal "2500.4.10", FWBRelease.next_build_number(latest: "2500.4.9", run_number: 1, run_attempt: 1)
  end

  def test_number_rolls_over_without_exceeding_component_limits
    assert_equal "2501.0.0", FWBRelease.next_build_number(latest: "2500.99.99", run_number: 1, run_attempt: 1)
  end

  def test_maximum_and_malformed_build_numbers_stop_release
    ["9999.99.99", "10.beta", "1.100.2"].each do |latest|
      assert_raises(RuntimeError) { FWBRelease.next_build_number(latest: latest, run_number: 1, run_attempt: 1) }
    end
  end

  def test_invalid_run_attempt_is_rejected
    assert_raises(RuntimeError) { FWBRelease.next_build_number(latest: 8, run_number: 1, run_attempt: 100) }
  end

  def test_missing_configuration_lists_names_without_values
    error = assert_raises(RuntimeError) { FWBRelease.validate_configuration!({"ASC_KEY_ID" => "a-sensitive-value"}) }
    assert_includes error.message, "ASC_ISSUER_ID"
    refute_includes error.message, "a-sensitive-value"
  end

  def test_dsn_and_endpoint_validation_rejects_unsupported_urls
    env = FWBRelease::REQUIRED.to_h { |key| [key, "configured"] }
    env["SENTRY_DSN"] = "https://public-key@ingest.sentry.io/123"
    FWBRelease.validate_configuration!(env)
    %w[http://key@ingest.sentry.io/123 https://key@ingest.sentry.io/123?secret=value https://key@ingest.sentry.io/123#fragment].each do |dsn|
      assert_raises(RuntimeError) { FWBRelease.validate_configuration!(env.merge("SENTRY_DSN" => dsn)) }
    end
    assert_raises(RuntimeError) { FWBRelease.validate_configuration!(env.merge("SENTRY_URL" => "http://sentry.io")) }
  end

  def test_trusted_main_guard_accepts_main_push
    env = trusted_main_env
    FWBRelease.require_trusted_main!(env)
  end

  def test_trusted_main_guard_rejects_another_repository
    assert_raises(RuntimeError) do
      FWBRelease.require_trusted_main!(trusted_main_env.merge("GITHUB_REPOSITORY" => "another/repository"))
    end
  end

  def test_branch_guard_rejects_manual_dispatch_from_another_branch
    env = trusted_main_env.merge("GITHUB_REF" => "refs/heads/feature", "GITHUB_EVENT_NAME" => "workflow_dispatch")
    assert_raises(RuntimeError) { FWBRelease.require_trusted_main!(env) }
  end

  def test_pull_request_cannot_release
    env = trusted_main_env.merge("GITHUB_EVENT_NAME" => "pull_request")
    assert_raises(RuntimeError) { FWBRelease.require_trusted_main!(env) }
  end

  def test_base64_credentials_are_private_and_invalid_values_are_not_echoed
    Dir.mktmpdir do |dir|
      path = File.join(dir, "key")
      FWBRelease.decode_secret!({"KEY" => Base64.strict_encode64("private-value")}, "KEY", path)
      assert_equal 0o600, File.stat(path).mode & 0o777
      assert_equal "private-value", File.read(path)
      error = assert_raises(RuntimeError) { FWBRelease.decode_secret!({"KEY" => "invalid-private-value"}, "KEY", path) }
      refute_includes error.message, "invalid-private-value"
    end
  end

  def test_profile_must_match_app_store_team_app_and_healthkit
    profile = {
      "TeamIdentifier" => [FWBRelease::TEAM_ID],
      "ExpirationDate" => Time.now + 3600,
      "Entitlements" => {
        "application-identifier" => "#{FWBRelease::TEAM_ID}.#{FWBRelease::APP_ID}",
        "get-task-allow" => false,
        "com.apple.developer.healthkit" => true
      }
    }
    Dir.mktmpdir do |dir|
      signing = FWBRelease::Signing.new(File.join(dir, "signing"), {})
      signing.validate_profile!(profile)
      assert_raises(RuntimeError) { signing.validate_profile!(profile.merge("TeamIdentifier" => ["WRONGTEAM"])) }
      assert_raises(RuntimeError) { signing.validate_profile!(profile.merge("ExpirationDate" => Time.now - 1)) }
      assert_raises(RuntimeError) { signing.validate_profile!(profile.merge("ProvisionedDevices" => ["device-id"])) }
      ["application-identifier", "get-task-allow", "com.apple.developer.healthkit"].each do |key|
        entitlements = profile.fetch("Entitlements").reject { |name, _| name == key }
        assert_raises(RuntimeError) { signing.validate_profile!(profile.merge("Entitlements" => entitlements)) }
      end
      signing.cleanup
    end
  end

  private

  def trusted_main_env
    {
      "GITHUB_ACTIONS" => "true",
      "GITHUB_REPOSITORY" => FWBRelease::RELEASE_REPOSITORY,
      "GITHUB_REF" => "refs/heads/main",
      "GITHUB_EVENT_NAME" => "push"
    }
  end
end
