// @ts-ignore
const cv = window.cv;

export type SignalType = 'LONG' | 'SHORT' | null;

const templates: { [key: string]: any } = {};

export async function initCvService() {
  const templateNames = ['Buy', 'Sell', 'Smart Buy', 'Smart Sell'];
  for (const name of templateNames) {
    const img = await loadImage(`/templates/${name}.png`);
    const mat = cv.imread(img);
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    templates[name] = gray;
    mat.delete();
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function detectSignal(base64Image: string): Promise<SignalType> {
  const img = await loadImage(base64Image);
  const src = cv.imread(img);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  let bestMatch = { type: null as SignalType, score: 0 };

  for (const [name, template] of Object.entries(templates)) {
    const dst = new cv.Mat();
    cv.matchTemplate(gray, template, dst, cv.TM_CCOEFF_NORMED);
    const minMax = cv.minMaxLoc(dst);
    
    if (minMax.maxVal > 0.9) { // 90% match threshold
      if (minMax.maxVal > bestMatch.score) {
        // User rule: Buy/Upward = LONG, Sell/Downward = SHORT
        const isLong = name.toLowerCase().includes('buy');
        bestMatch = {
          type: isLong ? 'LONG' : 'SHORT',
          score: minMax.maxVal
        };
      }
    }
    dst.delete();
  }

  src.delete();
  gray.delete();
  return bestMatch.type;
}
