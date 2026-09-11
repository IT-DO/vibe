//
//  Мост между Swift и Objective-C.
//
//  Нативные модули написаны на Swift, а React Native объявляет их через
//  макросы Objective-C (RCT_EXTERN_MODULE). Чтобы Swift видел типы
//  RCTPromiseResolveBlock и RCTPromiseRejectBlock, заголовок моста должен
//  импортировать RCTBridgeModule.h.
//

#import <React/RCTBridgeModule.h>
