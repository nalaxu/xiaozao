// 生成 PWA 图标（public/icons）。只用图形不用文字，避免依赖系统字体。运行：npx tsx scripts/make-icons.ts
import sharp from "sharp";

// lucide chef-hat 图标的路径（24×24 视图）
const HAT = `<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/>`;

function svg(size: number, { maskable }: { maskable: boolean }) {
  // 可遮罩图标的内容要在中间 80% 的安全区内
  const scale = maskable ? 0.5 : 0.62;
  const radius = maskable ? 0 : size * 0.22;
  const g = size * scale;
  const offset = (size - g) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#d9531e"/>
  <g transform="translate(${offset} ${offset + g * 0.02}) scale(${g / 24})" fill="none" stroke="#ffffff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${HAT}</g>
</svg>`;
}

async function main() {
  const out = [
    { file: "icon-192.png", size: 192, maskable: false },
    { file: "icon-512.png", size: 512, maskable: false },
    { file: "icon-maskable-512.png", size: 512, maskable: true },
    { file: "apple-touch-icon.png", size: 180, maskable: true },
  ];
  for (const o of out) {
    await sharp(Buffer.from(svg(o.size, o))).png().toFile(`public/icons/${o.file}`);
  }
  console.log("已生成", out.map((o) => o.file).join("、"));
}

void main();
