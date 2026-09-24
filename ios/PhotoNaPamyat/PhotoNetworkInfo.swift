import Foundation

/**
 Сведения о сети на iOS.

 Адрес шлюза iOS приложениям не отдаёт — таблицы маршрутизации закрыты
 песочницей. Поэтому возвращаем только собственный адрес, а вероятный адрес
 принтера достраивается в `discovery.ts` (последний октет — 1). В режиме
 точки доступа принтера это работает: он там и есть шлюз.

 Имя сети (SSID) требует разрешения на геолокацию и профиля с правом
 `com.apple.developer.networking.wifi-info`. Для работы будки оно не нужно,
 поэтому просто возвращаем nil — в админке поле останется пустым.
 */
@objc(PhotoNetworkInfo)
class PhotoNetworkInfo: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(getGatewayIp:withRejecter:)
  func getGatewayIp(resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }

  @objc(getLocalIp:withRejecter:)
  func getLocalIp(resolve: @escaping RCTPromiseResolveBlock,
                  reject: @escaping RCTPromiseRejectBlock) {
    resolve(Self.wifiAddress())
  }

  @objc(getSsid:withRejecter:)
  func getSsid(resolve: @escaping RCTPromiseResolveBlock,
               reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }

  /// IPv4-адрес интерфейса Wi-Fi (en0).
  private static func wifiAddress() -> String? {
    var address: String?
    var interfaces: UnsafeMutablePointer<ifaddrs>?

    guard getifaddrs(&interfaces) == 0, let first = interfaces else {
      return nil
    }
    defer { freeifaddrs(interfaces) }

    var pointer: UnsafeMutablePointer<ifaddrs>? = first
    while let current = pointer {
      let interface = current.pointee
      let family = interface.ifa_addr.pointee.sa_family

      if family == UInt8(AF_INET), String(cString: interface.ifa_name) == "en0" {
        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        if getnameinfo(interface.ifa_addr,
                       socklen_t(interface.ifa_addr.pointee.sa_len),
                       &hostname,
                       socklen_t(hostname.count),
                       nil,
                       0,
                       NI_NUMERICHOST) == 0 {
          address = String(cString: hostname)
        }
      }
      pointer = interface.ifa_next
    }

    return address
  }
}
