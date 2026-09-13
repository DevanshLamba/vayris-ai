const fs = require('fs');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

async function makeIcon() {
  const inputPath = 'C:/Users/devan/.gemini/antigravity/brain/4851ce1c-53ff-40fa-87fa-8034767ecb78/.user_uploaded/media_1788488819002.png';
  const outputPathPng = 'build/icon.png';
  const outputPathIco = 'build/icon.ico';

  if (!fs.existsSync('build')) {
    fs.mkdirSync('build');
  }

  // Use sharp to read metadata
  const metadata = await sharp(inputPath).metadata();
  console.log(`Original image: ${metadata.width}x${metadata.height}`);
  
  // Crop the top circular part. The image is 500x750 or something similar.
  // We want to crop a square from the top.
  // The Vayris symbol occupies the top section. Let's just crop a square of size width x width.
  const size = Math.min(metadata.width, metadata.height); // For tall image, size = width.
  
  await sharp(inputPath)
    .extract({ left: 0, top: 0, width: size, height: size })
    // Replace white background with transparent
    // Sharp can use "trim" or composite to remove background, but simple way is to use a threshold.
    // Actually, making white transparent is tricky in sharp without a custom formula.
    // However, for an ICO, a white background is perfectly fine! The prompt didn't say it must be transparent, it said "If the source image has transparency, preserve it."
    // The source image is a JPEG-like PNG with a white background. So keeping the white background is fine.
    .png()
    .toFile(outputPathPng);

  console.log(`Saved intermediate PNG to ${outputPathPng}`);

  // Convert to ICO
  const buf = await pngToIco(outputPathPng);
  fs.writeFileSync(outputPathIco, buf);
  console.log(`Saved ICO to ${outputPathIco}`);
}

makeIcon().catch(err => {
  console.error(err);
  process.exit(1);
});
