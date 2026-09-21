-- CreateTable
CREATE TABLE "SymbolAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SymbolAlert_endpoint_symbol_key" ON "SymbolAlert"("endpoint", "symbol");

-- CreateIndex
CREATE INDEX "SymbolAlert_symbol_idx" ON "SymbolAlert"("symbol");
