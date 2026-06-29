-- CreateTable
CREATE TABLE `CapiEventLog` (
    `id` VARCHAR(191) NOT NULL,
    `shop` VARCHAR(255) NOT NULL,
    `pixelId` VARCHAR(32) NOT NULL,
    `eventName` VARCHAR(64) NOT NULL,
    `eventId` VARCHAR(128) NOT NULL,
    `value` DOUBLE NULL,
    `currency` VARCHAR(8) NULL,
    `status` VARCHAR(16) NOT NULL,
    `response` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CapiEventLog_shop_idx`(`shop`),
    INDEX `CapiEventLog_shop_eventName_idx`(`shop`, `eventName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
