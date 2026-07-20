Pod::Spec.new do |s|
  s.name           = "ListgolfWatchSync"
  s.version        = "1.0.0"
  s.summary        = "WatchConnectivity bridge for List.Golf"
  s.license        = "MIT"
  s.authors        = "List.Golf"
  s.homepage       = "https://www.listgolf.club"
  s.platform       = :ios, "15.1"
  s.swift_version  = "5.9"
  s.source         = { :git => "" }
  s.static_framework = true
  s.dependency "ExpoModulesCore"
  s.source_files = "**/*.{h,m,swift}"
end
