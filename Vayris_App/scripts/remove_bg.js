const { Jimp } = require('jimp');

async function removeWhiteBackground() {
  try {
    const image = await Jimp.read('ui/public/logo-full.png');
    
    image.scan((x, y, idx) => {
      const red = image.bitmap.data[idx + 0];
      const green = image.bitmap.data[idx + 1];
      const blue = image.bitmap.data[idx + 2];
      
      if (red > 240 && green > 240 && blue > 240) {
        image.bitmap.data[idx + 3] = 0;
      }
    });

    await image.write('ui/public/logo-transparent.png');
    console.log('Successfully created transparent logo!');
  } catch (err) {
    console.error('Error processing image:', err);
  }
}

removeWhiteBackground();
