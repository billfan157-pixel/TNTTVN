import parishLogoDataUri from '../assets/logo-gia-ton.png?inline'

/** Self-contained parish logo for printable/exported documents. */
export const PARISH_LOGO_DATA_URI = parishLogoDataUri

/** HTML img tag for logo — sizePx is rendered size (default 56px). */
export function parishLogoImgHtml(sizePx: number = 56, className: string = 'parish-logo'): string {
  return '<img src="' + PARISH_LOGO_DATA_URI + '" alt="Logo Xứ Đoàn Đức Mẹ Fatima" class="' + className + '" style="width:' + sizePx + 'px;height:' + sizePx + 'px;object-fit:contain;flex-shrink:0;" />'
}
