import Foundation
import UIKit

/**
 Запасной путь печати через AirPrint.

 Показывает системный контроллер печати, из которого гость может уйти, —
 поэтому в необслуживаемом киоске он не используется. Нужен для отладки на
 площадке и как крайняя мера, если прямой IPP не поднялся.
 */
@objc(PhotoSystemPrint)
class PhotoSystemPrint: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc(isAvailable:withRejecter:)
  func isAvailable(resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    resolve(UIPrintInteractionController.isPrintingAvailable)
  }

  @objc(print:withJobName:withCopies:withResolver:withRejecter:)
  func print(filePath: String,
             jobName: String,
             copies: Int,
             resolve: @escaping RCTPromiseResolveBlock,
             reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let path = filePath.hasPrefix("file://") ? String(filePath.dropFirst(7)) : filePath
      guard let data = FileManager.default.contents(atPath: path) else {
        reject("bad_file", "Не удалось прочитать файл: \(path)", nil)
        return
      }

      let controller = UIPrintInteractionController.shared
      let info = UIPrintInfo.printInfo()
      info.outputType = .photo
      info.jobName = jobName
      // Фотопечать всегда в край: лист уже собран точно под размер бумаги.
      info.orientation = .portrait
      controller.printInfo = info
      controller.printingItem = data

      controller.present(animated: true) { _, completed, error in
        if let error = error {
          reject("print_failed", error.localizedDescription, error)
        } else if completed {
          resolve(nil)
        } else {
          reject("cancelled", "Печать отменена", nil)
        }
      }
    }
  }
}
