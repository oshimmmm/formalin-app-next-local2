-- CreateIndex
CREATE INDEX "Formalin_lot_number_box_number_productCode_idx" ON "Formalin"("lot_number", "box_number", "productCode");

-- CreateIndex
CREATE INDEX "Formalin_status_idx" ON "Formalin"("status");

-- CreateIndex
CREATE INDEX "Formalin_place_idx" ON "Formalin"("place");

-- CreateIndex
CREATE INDEX "Formalin_size_idx" ON "Formalin"("size");

-- CreateIndex
CREATE INDEX "Formalin_expired_idx" ON "Formalin"("expired");

-- CreateIndex
CREATE INDEX "Formalin_timestamp_idx" ON "Formalin"("timestamp");

-- CreateIndex
CREATE INDEX "History_formalinId_idx" ON "History"("formalinId");
