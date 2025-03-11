/*
  Warnings:

  - A unique constraint covering the columns `[lot_number,key]` on the table `Formalin` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Formalin_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "Formalin_lot_number_key_key" ON "Formalin"("lot_number", "key");
