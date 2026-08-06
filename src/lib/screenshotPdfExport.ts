export async function exportElementScreenshotToSinglePagePdf(element: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const previousScrollX = window.scrollX;
  const previousScrollY = window.scrollY;

  window.scrollTo(0, 0);
  await Promise.all(Array.from(element.querySelectorAll('img')).map(async (image) => {
    if (!image.complete) await new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });
    if (typeof image.decode === 'function') await image.decode().catch(() => undefined);
  }));
  await new Promise((resolve) => window.requestAnimationFrame(() => {
    window.requestAnimationFrame(resolve);
  }));

  try {
    const rect = element.getBoundingClientRect();
    const width = Math.ceil(Math.max(element.scrollWidth, rect.width));
    const height = Math.ceil(Math.max(element.scrollHeight, rect.height));
    const chunkHeight = 900;

    const pdf = new jsPDF({
      compress: true,
      format: [width, height],
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'px',
    });

    for (let offsetY = 0; offsetY < height; offsetY += chunkHeight) {
      const currentHeight = Math.min(chunkHeight, height - offsetY);
      const canvas = await html2canvas(element, {
        allowTaint: false,
        backgroundColor: '#f4f6f8',
        height: currentHeight,
        logging: false,
        scale: 2,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        windowHeight: height,
        windowWidth: width,
        width,
        x: 0,
        y: offsetY,
      });
      const imageData = canvas.toDataURL('image/png');
      pdf.addImage(imageData, 'PNG', 0, offsetY, width, currentHeight);
    }

    pdf.save(filename);
  } finally {
    window.scrollTo(previousScrollX, previousScrollY);
  }
}
