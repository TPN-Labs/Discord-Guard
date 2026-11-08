import { parse } from 'tldts';

/** A link in message text (docs/specs/2026-11-08-anti-spam/requirements.md AC-05). */
export interface FoundLink {
	/** Offsets of the whole match in the text, masked-link brackets included. */
	start: number;
	end: number;
	/** The URL, with `https://` added to a scheme-less invite. */
	url: string;
	/** The text of a masked link (`[label](url)`); null otherwise. */
	label: string | null;
	isInvite: boolean;
}

// One scan, alternatives tried left to right at each position, matches never overlap:
// masked link, angle-bracketed URL, bare http(s) URL, scheme-less Discord invite.
const LINK_PATTERN = new RegExp(
	[
		String.raw`\[(?<label>[^\]\n]*)\]\(\s*<?(?<masked>https?:\/\/[^\s<>)]+)>?\s*\)`,
		String.raw`<(?<angle>https?:\/\/[^\s<>]+)>`,
		String.raw`(?<bare>https?:\/\/[^\s<>]+)`,
		String.raw`(?<![\w./-])(?<invite>(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+)`
	].join('|'),
	'gi'
);

const TRAILING_PUNCTUATION = /[.,!?:;'"]$/;
const INVITE_URL = /^https?:\/\/(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i;
const MESSAGE_LINK_HOST = /^(?:(?:ptb|canary)\.)?discord(?:app)?\.com$/;
const GIF_DOMAINS = ['tenor.com', 'giphy.com'];

/** Drops trailing punctuation and an unbalanced closing parenthesis, so `(see https://x.ro).` finds `https://x.ro`. */
function trimBareUrl(url: string): string {
	let trimmed = url;
	for (;;) {
		if (TRAILING_PUNCTUATION.test(trimmed)) {
			trimmed = trimmed.slice(0, -1);
		} else if (trimmed.endsWith(')') && count(trimmed, ')') > count(trimmed, '(')) {
			trimmed = trimmed.slice(0, -1);
		} else {
			return trimmed;
		}
	}
}

function count(text: string, char: string): number {
	return text.split(char).length - 1;
}

export function findLinks(text: string): FoundLink[] {
	const links: FoundLink[] = [];
	for (const match of text.matchAll(LINK_PATTERN)) {
		const { label, masked, angle, bare, invite } = match.groups ?? {};
		const start = match.index;
		let end = start + match[0].length;
		let url: string;

		if (masked !== undefined) {
			url = masked;
		} else if (angle !== undefined) {
			url = angle;
		} else if (bare !== undefined) {
			url = trimBareUrl(bare);
			end = start + url.length;
		} else {
			url = `https://${invite}`;
		}

		links.push({ start, end, url, label: label ?? null, isInvite: INVITE_URL.test(url) });
	}

	return links;
}

function hostname(url: string): string | null {
	return parse(url).hostname?.toLowerCase() ?? null;
}

function pathname(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		// An unparseable URL has no path we can trust; the caller treats it as an ordinary link.
		return '';
	}
}

/** GIFs from the picker and links to Discord messages don't count towards link spread (requirements AC-05, Q-A). */
export function countsForLinkSpread(link: FoundLink): boolean {
	if (link.isInvite) return true;

	const host = hostname(link.url);
	if (host === null) return true;
	if (GIF_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return false;
	if (MESSAGE_LINK_HOST.test(host) && pathname(link.url).startsWith('/channels/')) return false;

	return true;
}

/** The domain name without subdomains or public suffix (ICANN list), lower-cased; `(link)` for IPs and bare hosts (AC-24). */
export function censorDomain(url: string): string {
	const result = parse(url);
	if (result.isIp || !result.domainWithoutSuffix) return '(link)';
	return result.domainWithoutSuffix.toLowerCase();
}

/** Replaces every link with its censored domain; a masked link keeps its (censored) label (AC-24). */
export function censorLinks(text: string): string {
	let censored = text;
	// Right to left, so the offsets of earlier links stay valid.
	for (const link of findLinks(text).reverse()) {
		const domain = censorDomain(link.url);
		const label = link.label?.trim() ? censorLinks(link.label.trim()) : '';
		const replacement = label ? `${label} (${domain})` : domain;
		censored = censored.slice(0, link.start) + replacement + censored.slice(link.end);
	}

	return censored;
}
