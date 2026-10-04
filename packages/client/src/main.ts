const canvas = document.querySelector<HTMLCanvasElement>('#world');
const ctx = canvas?.getContext('2d');
if (!canvas || !ctx)
  throw new Error('Kith needs a <canvas id="world"> with 2D support');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
ctx.fillStyle = '#9fd48a';
ctx.fillRect(0, 0, canvas.width, canvas.height);
