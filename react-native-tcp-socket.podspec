require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-tcp-socket"
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = package['repository']['url']
  s.license      = package['license']
  s.authors      = package['author']
  s.platforms    = { :ios => "9.0", :tvos => "10.0", :osx => "10.14" }
  s.source       = { :git => "https://github.com/Rapsssito/react-native-tcp-socket.git", :tag => "#v{s.version}" }

  s.source_files = "ios/**.{h,m,swift}"
  s.requires_arc = true

  s.dependency "React-Core"
  s.dependency "CocoaAsyncSocket"

end
