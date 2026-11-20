-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('FETCHING', 'PREVIEW', 'CONFIRMED', 'DISCARDED', 'FAILED');

-- CreateTable
CREATE TABLE "BookImport" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "items" JSONB NOT NULL DEFAULT '[]',
    "report" JSONB NOT NULL DEFAULT '{}',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "BookImport_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BookImport" ADD CONSTRAINT "BookImport_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
