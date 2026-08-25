/**
 * One-off bulk photo import from a local folder of existing food photos
 * (/Users/tann/Desktop/Food Photos), keyed by `menuNumber` — the mapping
 * below was built by manually cross-referencing each filename's dish name
 * against the actual product name, NOT by trusting the number printed in
 * the filename, because the photo numbering and the current menu's
 * numbering have drifted apart in the 35–39 range (an item was evidently
 * removed from the printed menu at some point, shifting everything after
 * it down by one; the old photos were never renumbered to match). Trust
 * this hardcoded mapping over the filename's own number.
 *
 * Reuses the exact same validation/transform pipeline as a normal browser
 * upload (src/server/menu/product-image.ts's `reencodeStagedImage`) —
 * `sharp`: apply EXIF rotation, resize to fit 1600px, re-encode as JPEG
 * q82 — but skips that function's staging-blob round trip, which exists
 * only to solve the browser-upload flow's problem (get bytes out of a
 * Server Action before Vercel's 4.5MB body cap sees them). A trusted
 * local script reading files directly from disk has no such constraint,
 * so this uploads straight to the final `products/` path.
 *
 * Usage: npx tsx scripts/bulk-upload-product-photos.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { prisma } from "../src/server/db";
import { recordAuditLog } from "../src/server/audit/log";

const PHOTOS_DIR = "/Users/tann/Desktop/Food Photos";
const MAX_DIMENSION = 1600;

/** filename -> menuNumber. Verified by dish name, not by the number in
 * the filename — see the file-level doc comment. */
const MAPPING: Array<[string, number]> = [
  ["3. Sea food roll.jpg", 3],
  ["4. grilled pork sausage.jpg", 4],
  ["5. Dumplings.jpg", 5],
  ["6. Fried dumplings.JPG", 6],
  ["7. steamed bun.png", 7],
  ["8. Gua Bao.jpg", 8],
  ["9. mixed beef salad.jpg", 9],
  ["10. mixed chicken salad.jpg", 10],
  ["12. mango salad.jpg", 11],
  ["13. Mixed shrimp salad.jpg", 12],
  ["14. beef fried noodle.jpg", 13],
  ["15. Seafood fried noodle.jpg", 14],
  ["16. Chicken fried noodle.jpg", 15],
  ["17. vegetarian fried noodle.jpg", 16],
  ["18. Vermicelli pork bowl.jpg", 17],
  ["19. vermicelli pork bowl with spring roll.jpg", 18],
  ["20. vermicelli beef bowl.jpg", 19],
  ["21. Vermicelli spring roll bowl.jpg", 20],
  ["22. Vermicelli Tofu & Spring Roll bowl.jpg", 21],
  ["23. Chicken pad thai.jpg", 22],
  ["24. Shrimp pad thai.jpg", 23],
  ["25. Tofu pad thai.jpg", 24],
  ["26. beef pho.jpg", 25],
  ["27. Garlic Beef Pho.jpg", 26],
  ["28. rare beef pho.jpg", 27],
  ["29. tofu pho.jpg", 28],
  ["30. chicken pho.jpg", 29],
  ["31. meat ball pho.jpg", 30],
  ["32. black pepper beef.jpg", 31],
  ["33. bulgogi beef.jpg", 32],
  ["34. Kung Pao Beef.jpg", 33],
  ["35. Sweet and Sour Chicken.jpg", 34],
  ["37. Cashew chicken.jpg", 36],
  ["39. korean chicken.jpg", 38],
  ["40. black pepper chicken.jpg", 39],
  ["44. sweet and sour prawn.jpg", 43],
  ["45. Kung Pao Prawn.jpg", 44],
  ["46. Crispy Prawn Steak.jpg", 45],
  ["47. Sesame Coated Prawns.jpg", 46],
  ["48. prawns tempura.PNG", 47],
  ["49. cashew prawn.jpg", 48],
  ["50. rocket prawns.JPG", 49],
  ["51. Sweet and sour tofu.jpg", 50],
  ["52. spicy tofu.jpg", 51],
  ["53. Chicken Rice.jpg", 52],
  ["54. Beef Rice.jpg", 53],
  ["55. seafood fried rice.jpg", 54],
  ["56. vegetable fried rice.jpg", 55],
  ["57. teriyaki chicken Rice.jpg", 56],
  ["58. grilled pork rice.jpg", 57],
  ["59. teriyaki duck rice.jpg", 58],
  ["60. Kung Pao Pork.jpg", 59],
  ["61. Egg fried rice.jpg", 60],
  ["62. Steamed rice.jpg", 61],
  ["63. peking duck.jpg", 62],
];

async function main() {
  console.log(`Uploading ${MAPPING.length} photos from ${PHOTOS_DIR}\n`);

  let uploaded = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const [filename, menuNumber] of MAPPING) {
    const path = join(PHOTOS_DIR, filename);
    if (!existsSync(path)) {
      failures.push(`${filename}: file not found`);
      continue;
    }

    const product = await prisma.product.findFirst({
      where: { menuNumber, deletedAt: null },
      select: { id: true, name: true, imageUrl: true },
    });
    if (!product) {
      failures.push(`${filename}: no product with menuNumber ${menuNumber}`);
      continue;
    }
    if (product.imageUrl) {
      console.log(`skip  #${menuNumber} ${product.name} — already has a photo`);
      skipped++;
      continue;
    }

    try {
      const inputBuffer = readFileSync(path);
      const outputBuffer = await sharp(inputBuffer)
        .rotate()
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();

      const blob = await put(`products/${randomUUID()}.jpg`, outputBuffer, {
        access: "public",
        contentType: "image/jpeg",
      });

      await prisma.product.update({ where: { id: product.id }, data: { imageUrl: blob.url } });

      await recordAuditLog({
        actorType: "SYSTEM",
        action: "PRODUCT_PHOTO_BULK_UPLOADED",
        entityType: "Product",
        entityId: product.id,
        after: { imageUrl: blob.url, sourceFile: filename },
      });

      console.log(`  ok  #${menuNumber} ${product.name}`);
      uploaded++;
    } catch (err) {
      failures.push(`${filename} (#${menuNumber} ${product.name}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nUploaded: ${uploaded}  Skipped (already had a photo): ${skipped}  Failed: ${failures.length}`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
