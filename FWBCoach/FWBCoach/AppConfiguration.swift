import Foundation
import SwiftUI

enum AppConfiguration {
    static let supabaseURL = URL(string: "https://qukdfjeupjhpthfbaonv.supabase.co")!
    static let supabasePublishableKey = "sb_publishable_qeOpd7yy_l0K2iwm7ri6VA_EqD7NOjy"
    static let coachEmail = "benjaminbenz.fit@gmail.com"
    static let coachWebAppURL = URL(string: "https://benjaminbenz.com/coach-admin.html?v=coach-native-1")!
}

enum FWBTheme {
    static let lime = Color("BrandPrimary")
    static let brandPrimaryInk = Color("BrandPrimaryInk")
    static let ink = Color("Ink")
    static let inkDeep = Color("InkDeep")
    static let paper = Color("Canvas")
    static let surfaceSoft = Color("SurfaceSoft")
    static let surface = Color("Surface")
    static let muted = Color("TextMuted")
    static let border = Color("Border")
}
