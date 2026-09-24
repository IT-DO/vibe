#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (PhotoKiosk, NSObject)

RCT_EXTERN_METHOD(enterKioskMode : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(exitKioskMode : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(isKioskActive : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(keepScreenOn : (BOOL)enabled withResolver : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setImmersive : (BOOL)enabled withResolver : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(playCue : (NSString *)cue)

@end
