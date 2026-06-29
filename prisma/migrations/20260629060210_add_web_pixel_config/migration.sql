-- CreateTable
CREATE TABLE `WebPixelConfig` (
    `shop` VARCHAR(255) NOT NULL,
    `webPixelId` VARCHAR(255) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`shop`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
