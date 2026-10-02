import Foundation
import Supabase

/// The reviewed fields shared with the web app and extract-dexa-report.
enum ClientDexaField: String, CaseIterable, Identifiable {
    case bodyweightLb = "bodyweight_lb"
    case bodyfatPercent = "bodyfat_percent"
    case leanMassLb = "lean_mass_lb"
    case fatMassLb = "fat_mass_lb"
    case boneMineralContentLb = "bone_mineral_content_lb"
    case armsFatPercent = "arms_fat_percent"
    case legsFatPercent = "legs_fat_percent"
    case trunkFatPercent = "trunk_fat_percent"
    case androidFatPercent = "android_fat_percent"
    case gynoidFatPercent = "gynoid_fat_percent"
    case agRatio = "ag_ratio"
    case rmrCalPerDay = "rmr_cal_per_day"
    case vatMassLb = "vat_mass_lb"
    case vatVolumeIn3 = "vat_volume_in3"
    case boneDensityGCm2 = "bone_density_g_cm2"
    case boneTScore = "bone_t_score"
    case boneZScore = "bone_z_score"
    case armsLeanMassLb = "arms_lean_mass_lb"
    case legsLeanMassLb = "legs_lean_mass_lb"
    case trunkLeanMassLb = "trunk_lean_mass_lb"
    case rightArmLeanMassLb = "right_arm_lean_mass_lb"
    case leftArmLeanMassLb = "left_arm_lean_mass_lb"
    case rightLegLeanMassLb = "right_leg_lean_mass_lb"
    case leftLegLeanMassLb = "left_leg_lean_mass_lb"

    var id: String { rawValue }
    static let coreFields: [Self] = [.bodyweightLb, .bodyfatPercent, .leanMassLb]
    static var bodySpecFields: [Self] { allCases.filter { !coreFields.contains($0) } }

    var label: String {
        switch self {
        case .bodyweightLb: "Bodyweight"
        case .bodyfatPercent: "Body fat"
        case .leanMassLb: "Lean mass"
        case .fatMassLb: "Fat mass"
        case .boneMineralContentLb: "Bone mineral content"
        case .armsFatPercent: "Arm fat"
        case .legsFatPercent: "Leg fat"
        case .trunkFatPercent: "Trunk fat"
        case .androidFatPercent: "Android fat"
        case .gynoidFatPercent: "Gynoid fat"
        case .agRatio: "A/G ratio"
        case .rmrCalPerDay: "RMR"
        case .vatMassLb: "Visceral fat mass"
        case .vatVolumeIn3: "Visceral fat volume"
        case .boneDensityGCm2: "Bone density"
        case .boneTScore: "Bone T-score"
        case .boneZScore: "Bone Z-score"
        case .armsLeanMassLb: "Arms lean mass"
        case .legsLeanMassLb: "Legs lean mass"
        case .trunkLeanMassLb: "Trunk lean mass"
        case .rightArmLeanMassLb: "Right arm lean mass"
        case .leftArmLeanMassLb: "Left arm lean mass"
        case .rightLegLeanMassLb: "Right leg lean mass"
        case .leftLegLeanMassLb: "Left leg lean mass"
        }
    }

    var unit: String {
        switch self {
        case .bodyfatPercent, .armsFatPercent, .legsFatPercent, .trunkFatPercent,
             .androidFatPercent, .gynoidFatPercent: "%"
        case .agRatio, .boneTScore, .boneZScore: ""
        case .rmrCalPerDay: "cal/day"
        case .vatVolumeIn3: "in³"
        case .boneDensityGCm2: "g/cm²"
        default: "lb"
        }
    }

    var minimum: Double {
        switch self {
        case .bodyweightLb: 20
        case .bodyfatPercent: 1
        case .leanMassLb: 10
        case .rmrCalPerDay: 500
        case .boneTScore, .boneZScore: -10
        default: 0
        }
    }

    var maximum: Double {
        switch self {
        case .bodyweightLb: 1500
        case .leanMassLb: 1400
        case .bodyfatPercent, .armsFatPercent, .legsFatPercent, .trunkFatPercent,
             .androidFatPercent, .gynoidFatPercent: 75
        case .fatMassLb, .vatVolumeIn3: 1000
        case .boneMineralContentLb: 50
        case .agRatio, .boneTScore, .boneZScore: 10
        case .rmrCalPerDay: 10000
        case .vatMassLb: 100
        case .boneDensityGCm2: 5
        case .armsLeanMassLb, .legsLeanMassLb, .trunkLeanMassLb: 500
        case .rightArmLeanMassLb, .leftArmLeanMassLb, .rightLegLeanMassLb, .leftLegLeanMassLb: 250
        }
    }
}

struct ClientDexaValidationError: LocalizedError, Equatable {
    let message: String
    var errorDescription: String? { message }
}

struct ClientDexaUpload {
    static let maximumBytes = 10 * 1_024 * 1_024
    let data: Data
    let mimeType: String
    let filename: String

    func validated() throws -> Self {
        guard !data.isEmpty, data.count <= Self.maximumBytes else {
            throw ClientDexaValidationError(message: "Choose a DEXA report that is 10 MB or smaller.")
        }
        let expectedSignature: [UInt8]
        switch mimeType {
        case "application/pdf": expectedSignature = Array("%PDF-".utf8)
        case "image/jpeg": expectedSignature = [0xff, 0xd8, 0xff]
        case "image/png": expectedSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        default:
            throw ClientDexaValidationError(message: "Choose a PDF, JPG, or PNG DEXA report.")
        }
        guard data.starts(with: expectedSignature) else {
            throw ClientDexaValidationError(message: "That file is not a valid PDF, JPG, or PNG report. Choose the original file.")
        }
        let safeFilename = String(filename.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }.map(String.init).joined().prefix(255))
        return Self(data: data, mimeType: mimeType, filename: safeFilename.isEmpty ? "dexa-report.\(fileExtension)" : safeFilename)
    }

    var fileExtension: String {
        switch mimeType {
        case "application/pdf": "pdf"
        case "image/png": "png"
        default: "jpg"
        }
    }

    func storagePath(accountID: UUID, reportID: UUID = UUID()) -> String {
        "\(accountID.uuidString.lowercased())/\(reportID.uuidString.lowercased()).\(fileExtension)"
    }

    static func isOwnedPath(_ path: String, accountID: UUID) -> Bool {
        let pieces = path.split(separator: "/", omittingEmptySubsequences: false)
        guard pieces.count == 2, pieces[0] == accountID.uuidString.lowercased() else { return false }
        let filename = String(pieces[1])
        // The web uploader has used both UUID and timestamp-based names. Match
        // the server's safe basename contract when opening existing reports.
        return filename.range(of: "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}$", options: .regularExpression) != nil
    }
}

struct ClientDexaReviewDraft: Equatable {
    var scanDate: String = ""
    var values: [ClientDexaField: String] = [:]

    func validatedValues(now: Date = Date()) throws -> ClientDexaReviewValues {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/Los_Angeles")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard scanDate.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil,
              let date = formatter.date(from: scanDate), formatter.string(from: date) == scanDate,
              scanDate >= "1900-01-01", scanDate <= formatter.string(from: now) else {
            throw ClientDexaValidationError(message: "Choose the date shown on the DEXA report. Future dates are not allowed.")
        }
        var reviewed: [ClientDexaField: Double] = [:]
        for field in ClientDexaField.allCases {
            let text = (values[field] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }
            guard let number = Double(text), number.isFinite,
                  number >= field.minimum, number <= field.maximum else {
                throw ClientDexaValidationError(message: "\(field.label) must be between \(field.minimum.formatted()) and \(field.maximum.formatted())\(field.unit.isEmpty ? "" : " " + field.unit).")
            }
            reviewed[field] = number
        }
        guard !reviewed.isEmpty else {
            throw ClientDexaValidationError(message: "Enter at least one measurement from the DEXA report.")
        }
        if let weight = reviewed[.bodyweightLb], let lean = reviewed[.leanMassLb], lean > weight {
            throw ClientDexaValidationError(message: "Lean mass cannot be greater than total bodyweight. Compare both values with the report.")
        }
        return ClientDexaReviewValues(scanDate: scanDate, values: reviewed)
    }
}

struct ClientDexaReviewValues: Encodable, Equatable {
    let scanDate: String
    let values: [ClientDexaField: Double]

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        var payload: [String: AnyJSON] = ["scan_date": .string(scanDate)]
        for field in ClientDexaField.allCases {
            payload[field.rawValue] = values[field].map(AnyJSON.double) ?? .null
        }
        try container.encode(payload)
    }
}

struct ClientDexaReport: Decodable, Identifiable, Equatable {
    let id: UUID
    let storagePath: String
    let originalFilename: String
    let mimeType: String
    let status: String
    let scanDate: String?
    let createdAt: String?
    let archivedAt: String?
    let warnings: [String]
    let values: [ClientDexaField: Double]

    var isArchived: Bool { archivedAt != nil }
    var statusLabel: String {
        switch status {
        case "processing": "Reading report"
        case "ready": "Ready to review"
        case "failed": "Needs attention"
        case "confirmed": "Measurements saved"
        default: "Uploaded"
        }
    }
    var reviewDraft: ClientDexaReviewDraft {
        ClientDexaReviewDraft(scanDate: scanDate ?? "", values: values.mapValues { String($0) })
    }

    init(id: UUID, storagePath: String, originalFilename: String, mimeType: String,
         status: String, scanDate: String? = nil, createdAt: String? = nil,
         archivedAt: String? = nil, warnings: [String] = [], values: [ClientDexaField: Double] = [:]) {
        self.id = id
        self.storagePath = storagePath
        self.originalFilename = originalFilename
        self.mimeType = mimeType
        self.status = status
        self.scanDate = scanDate
        self.createdAt = createdAt
        self.archivedAt = archivedAt
        self.warnings = warnings
        self.values = values
    }

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode([String: AnyJSON].self)
        guard let id = raw["id"]?.stringValue.flatMap(UUID.init(uuidString:)),
              let storagePath = raw["storage_path"]?.stringValue else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid DEXA report record."))
        }
        let metadata = raw["extraction_data"]?.objectValue ?? [:]
        let confirmed = metadata["confirmed_values"]?.objectValue ?? [:]
        let metrics = metadata["bodyspec_metrics"]?.objectValue ?? [:]
        var values: [ClientDexaField: Double] = [:]
        for field in ClientDexaField.allCases {
            let value: AnyJSON?
            if ClientDexaField.coreFields.contains(field) {
                value = raw["extracted_\(field.rawValue)"]
            } else {
                value = [raw[field.rawValue], confirmed[field.rawValue], metrics[field.rawValue]]
                    .compactMap { $0 }.first { !$0.isNil }
            }
            if let number = Self.number(value) { values[field] = number }
        }
        self.init(id: id, storagePath: storagePath,
                  originalFilename: raw["original_filename"]?.stringValue ?? "DEXA report",
                  mimeType: raw["mime_type"]?.stringValue ?? "application/pdf",
                  status: raw["status"]?.stringValue ?? "processing",
                  scanDate: raw["extracted_scan_date"]?.stringValue,
                  createdAt: raw["created_at"]?.stringValue,
                  archivedAt: raw["archived_at"]?.stringValue,
                  warnings: Self.safeWarnings(raw["extraction_warnings"]), values: values)
    }

    static func number(_ json: AnyJSON?) -> Double? {
        let value: Double?
        switch json {
        case .integer(let number): value = Double(number)
        case .double(let number): value = number
        default: value = nil
        }
        return value.flatMap { $0.isFinite ? $0 : nil }
    }

    static func safeWarnings(_ json: AnyJSON?) -> [String] {
        (json?.arrayValue ?? []).compactMap(\.stringValue).prefix(6).compactMap { warning in
            let clean = String(warning.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) ? " " : String($0) }.joined().prefix(240)).trimmingCharacters(in: .whitespacesAndNewlines)
            return clean.isEmpty ? nil : clean
        }
    }
}

struct ClientDexaExtractionResult: Decodable, Equatable {
    let reportID: UUID
    let status: String
    let scanDate: String?
    let values: [ClientDexaField: Double]
    let warnings: [String]

    init(reportID: UUID, status: String, scanDate: String? = nil,
         values: [ClientDexaField: Double] = [:], warnings: [String] = []) {
        self.reportID = reportID
        self.status = status
        self.scanDate = scanDate
        self.values = values
        self.warnings = warnings
    }

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode([String: AnyJSON].self)
        guard raw["error"]?.stringValue == nil,
              let id = raw["report_id"]?.stringValue.flatMap(UUID.init(uuidString:)),
              let status = raw["status"]?.stringValue, ["ready", "confirmed"].contains(status) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "No DEXA extraction result returned."))
        }
        let extracted = raw["extracted"]?.objectValue ?? [:]
        let values = Dictionary(uniqueKeysWithValues: ClientDexaField.allCases.compactMap { field in
            ClientDexaReport.number(extracted[field.rawValue]).map { (field, $0) }
        })
        self.init(reportID: id, status: status, scanDate: extracted["scan_date"]?.stringValue,
                  values: values, warnings: ClientDexaReport.safeWarnings(raw["warnings"]))
    }
}
