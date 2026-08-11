-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "subscriptionPriceRub" INTEGER,
    "subscriptionPeriodDays" INTEGER,
    "commissionRatePercent" REAL,
    "subscriptionEnforced" BOOLEAN,
    "appUrl" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPass" TEXT,
    "mailFrom" TEXT,
    "yookassaShopId" TEXT,
    "yookassaSecretKey" TEXT,
    "alertEmail" TEXT,
    "internalAlertToken" TEXT,
    "updatedAt" DATETIME NOT NULL
);
