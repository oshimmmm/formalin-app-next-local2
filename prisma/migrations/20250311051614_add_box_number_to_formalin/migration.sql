/*
  Warnings:

  - A unique constraint covering the columns `[lot_number,key,box_number]` on the table `Formalin` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Formalin_lot_number_key_key";

-- AlterTable
ALTER TABLE "Formalin" ADD COLUMN     "box_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Formalin_lot_number_key_box_number_key" ON "Formalin"("lot_number", "key", "box_number");
