import AVFoundation
import Foundation
import UIKit

/**
 Киоск-режим на iOS.

 Программно закрепить приложение, как на Android, нельзя: Apple не даёт такого
 API обычным программам. Единственный штатный способ — «Гид-доступ»
 (Настройки -> Универсальный доступ -> Гид-доступ), который оператор включает
 тройным нажатием боковой кнопки. Модуль умеет проверить, включён ли он, и
 сообщить об этом приложению; порядок настройки — в docs/KIOSK-SETUP.md.

 Что модуль делает сам: не даёт экрану гаснуть и проигрывает звуки сценария.
 */
@objc(PhotoKiosk)
class PhotoKiosk: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool {
    return true
  }

  /// На iOS закрепление включает человек, поэтому просто сообщаем текущее состояние.
  @objc(enterKioskMode:withRejecter:)
  func enterKioskMode(resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      resolve(UIAccessibility.isGuidedAccessEnabled)
    }
  }

  @objc(exitKioskMode:withRejecter:)
  func exitKioskMode(resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    resolve(false)
  }

  @objc(isKioskActive:withRejecter:)
  func isKioskActive(resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      resolve(UIAccessibility.isGuidedAccessEnabled)
    }
  }

  @objc(keepScreenOn:withResolver:withRejecter:)
  func keepScreenOn(enabled: Bool,
                    resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = enabled
      resolve(nil)
    }
  }

  /// Полноэкранный режим на iOS задаётся в контроллере, отдельного API нет.
  @objc(setImmersive:withResolver:withRejecter:)
  func setImmersive(enabled: Bool,
                    resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }

  /// Системные звуки сценария: свои файлы ради четырёх сигналов не тянем.
  @objc(playCue:)
  func playCue(cue: String) {
    let soundID: SystemSoundID
    switch cue {
    case "shutter":
      soundID = 1108  // затвор камеры
    case "countdown":
      soundID = 1103  // короткий тик
    case "done":
      soundID = 1054  // подтверждение
    case "error":
      soundID = 1073  // ошибка
    default:
      return
    }
    AudioServicesPlaySystemSound(soundID)
  }
}
