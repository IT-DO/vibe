#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (PhotoSystemPrint, NSObject)

RCT_EXTERN_METHOD(isAvailable : (RCTPromiseResolveBlock)resolve withRejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(print
                  : (NSString *)filePath withJobName
                  : (NSString *)jobName withCopies
                  : (NSInteger)copies withResolver
                  : (RCTPromiseResolveBlock)resolve withRejecter
                  : (RCTPromiseRejectBlock)reject)

@end
