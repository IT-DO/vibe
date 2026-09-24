#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (PhotoNetworkInfo, NSObject)

RCT_EXTERN_METHOD(getGatewayIp : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getLocalIp : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getSsid : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)

@end
