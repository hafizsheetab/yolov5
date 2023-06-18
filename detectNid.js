const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const tesseract = require('node-tesseract-ocr');
const { rimrafSync } = require('rimraf');

async function runYOLOv5(weightsPath, imagePath) {
  return new Promise(function (resolve, reject) {
    const yolov5Process = spawn(
      process.env.PYTHON_COMMAND,
      [
        'detect.py',
        '--weights',
        weightsPath,
        '--source',
        imagePath,
        '--save-txt',
        '--conf-thres',
        '0.60',
      ],
      {
        cwd: process.cwd(), // Set the working directory to the YOLOv5 folder
      }
    );

    yolov5Process.stdout.on('data', (data) => {
      console.log(`YOLOv5 stdout: ${data}`);
    });

    yolov5Process.stderr.on('data', (data) => {
      console.error(`YOLOv5 stderr: ${data}`);
      const dataString = data.toString();
      if (dataString.includes('labels saved')) {
        resolve(dataString);
      }
      //   reject(data.toString());
    });

    yolov5Process.on('close', (code) => {
      console.log(`YOLOv5 process exited with code ${code}`);
      resolve(true);
    });
  });
}

const labelAnalysis = async (labelPath) => {
  // Read the contents of the text file
  const data = fs.readFileSync(labelPath, 'utf8');

  // Split the data by newline character to get each line
  const lines = data.split('\n');

  // Create an empty array to store the parsed values
  let nidNumberCoordinates = [];
  let nidVersion = '';

  // Iterate over each line
  for (const element of lines) {
    const line = element.trim();

    // Skip empty lines
    if (line === '') {
      continue;
    }

    // Split the line by space character
    const values = line.split(' ');

    // Convert the values to numbers and store them in an array
    const numbers = values.map(Number);

    if (numbers[0] === 2 || numbers[0] === 3) {
      nidVersion = 'old nid';
    }

    if (numbers[0] === 1 || numbers[0] === 0) {
      nidVersion = 'new nid';
    }

    if (numbers[0] === 4) {
      nidNumberCoordinates.push(numbers[1]);
      nidNumberCoordinates.push(numbers[2]);
      nidNumberCoordinates.push(numbers[3]);
      nidNumberCoordinates.push(numbers[4]);
    }
  }

  return { nidNumberCoordinates, nidVersion };
};

const croppedImage = async (imagePath, coordinates, masterDirPath) => {
  console.log("Trying to Crop")
  console.log(imagePath)
  const image = await Jimp.read(imagePath)
  
      const imageWidth = image.bitmap.width;
      const imageHeight = image.bitmap.height;

      // YOLO normalized bounding box coordinates
      const yoloX = coordinates[0];
      const yoloY = coordinates[1];
      const yoloWidth = coordinates[2];
      const yoloHeight = coordinates[3];

      // Convert normalized coordinates to pixel coordinates
      const pixelX = yoloX * imageWidth;
      const pixelY = yoloY * imageHeight;
      const pixelWidth = yoloWidth * imageWidth;
      const pixelHeight = yoloHeight * imageHeight;

      // Calculate top-left corner coordinates and dimensions
      const x = pixelX - pixelWidth / 2;
      const y = pixelY - pixelHeight / 2;
      const width = pixelWidth;
      const height = pixelHeight;

      image
        .crop(x, y, width, height)
        .normalize()
        .grayscale()
        .greyscale()
        .write(`./${masterDirPath}/cropped_image.jpg`); // Save the cropped image
      console.log('cropped_image');
    
}
const ocr = async (masterDirPath) => {

  const config = {
    lang: 'eng',
    oem: 3,
    psm: 7,
  };
  const text = await tesseract.recognize(
    `./${masterDirPath}/cropped_image.jpg`,
    config
  );
  const pattern = /\b\d+(?:\s+\d+)*\b/
  const patterns = text.match(pattern)
  return patterns[0].replace(/\s/g, "")
  


};

const detect = async (imgUri) => {
  const weightsPath = process.env.TRAINED_MODEL_PATH;
  const imagePath = imgUri;
  const answer = await runYOLOv5(weightsPath, imagePath);
  const labelPath = answer
    .split('\n')
    .map((vAnswer) => {
      return vAnswer.trim();
    })
    .find((answer) => answer.includes('labels saved'))
    .split(' labels saved to ')[1];
  const masterDirPath = answer
    .split('\n')
    .map((vAnswer) => {
      return vAnswer.trim();
    })
    .find((answer) => answer.includes('Results saved'))
    .split(' saved to ')[1]
    .replace('\x1B[1m', '')
    .replace('\x1B[0m', '');
  const imageDirPath = answer
    .split('\n')
    .map((vAnswer) => {
      return vAnswer.trim();
    })
    .find((answer) => answer.includes('Results saved'))
    .split(' saved to ')[1]
    .replace('\x1B[1m', '')
    .replace('\x1B[0m', '');
  const labelDir = fs.readdirSync(labelPath);

  const detectedImagePathDir = fs.readdirSync(imageDirPath);

  const { nidVersion, nidNumberCoordinates } = await labelAnalysis(
    path.join(labelPath, labelDir[0])
  );
    if(!nidNumberCoordinates){
        throw {
            message: "NID Not Found"
        }
    }
  await croppedImage(
    path.join(imageDirPath, detectedImagePathDir.find(dir => dir !== "labels")),
    nidNumberCoordinates,
    masterDirPath
  );

  const nidNumber = await ocr(masterDirPath);

  rimrafSync(
    answer
      .split('\n')
      .map((vAnswer) => {
        return vAnswer.trim();
      })
      .find((answer) => answer.includes('Results saved'))
      .split(' saved to ')[1]
      .replace('\x1B[1m', '')
      .replace('\x1B[0m', '')
  );
  console.log(nidNumber, nidVersion)
  return {nidNumber, nidVersion}
};

module.exports = detect