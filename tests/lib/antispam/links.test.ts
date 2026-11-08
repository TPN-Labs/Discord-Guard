import { describe, expect, it } from 'vitest';
import { censorDomain, censorLinks, countsForLinkSpread, findLinks } from '../../../src/lib/antispam/links';

function urls(text: string): string[] {
	return findLinks(text).map((link) => link.url);
}

function counts(text: string): boolean {
	const [link] = findLinks(text);
	return countsForLinkSpread(link);
}

describe('findLinks', () => {
	it('findsHttpAndHttpsUrlsInAnyCase', () => {
		expect(urls('a https://free-nitro.ru/claim?x=1 b HTTP://Example.COM/x')).toEqual(['https://free-nitro.ru/claim?x=1', 'HTTP://Example.COM/x']);
	});

	it('findsTheUrlInsideAMaskedLinkAndKeepsItsLabel', () => {
		const [link] = findLinks('see [Claim here](https://free-nitro.ro/x) now');

		expect(link).toMatchObject({ url: 'https://free-nitro.ro/x', label: 'Claim here' });
	});

	it('findsAnAngleBracketedUrl', () => {
		expect(urls('look <https://free-nitro.ru/a> ok')).toEqual(['https://free-nitro.ru/a']);
	});

	it('findsDiscordInvitesWithOrWithoutAScheme', () => {
		expect(urls('join discord.gg/AbC123 or discord.com/invite/xyz or https://discord.gg/q1')).toEqual([
			'https://discord.gg/AbC123',
			'https://discord.com/invite/xyz',
			'https://discord.gg/q1'
		]);
	});

	it('leavesTrailingPunctuationOutOfABareUrl', () => {
		expect(urls('see https://x.ro/a. and (https://y.ro/b), https://z.ro!')).toEqual(['https://x.ro/a', 'https://y.ro/b', 'https://z.ro']);
	});

	it('keepsBalancedParenthesesInABareUrl', () => {
		expect(urls('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
	});

	it('findsNothingInTextWithoutLinks', () => {
		expect(findLinks('free nitro at free-nitro dot ru, email me@example.com')).toEqual([]);
	});
});

describe('countsForLinkSpread', () => {
	it('countsOrdinaryLinksAndInvites', () => {
		expect(counts('https://free-nitro.ru/claim')).toBe(true);
		expect(counts('discord.gg/AbC123')).toBe(true);
		expect(counts('https://cdn.discordapp.com/attachments/1/2/a.png')).toBe(true);
	});

	it('ignoresGifLinksFromTenorAndGiphy', () => {
		expect(counts('https://tenor.com/view/cat-123')).toBe(false);
		expect(counts('https://media.giphy.com/media/abc/giphy.gif')).toBe(false);
		expect(counts('https://giphy.com/gifs/abc')).toBe(false);
	});

	it('ignoresDiscordMessageLinks', () => {
		expect(counts('https://discord.com/channels/1/2/3')).toBe(false);
		expect(counts('https://ptb.discord.com/channels/1/2/3')).toBe(false);
		expect(counts('https://canary.discordapp.com/channels/1/2/3')).toBe(false);
	});

	it('doesNotMistakeLookalikeHostsForExceptions', () => {
		expect(counts('https://nottenor.com/view/x')).toBe(true);
		expect(counts('https://tenor.com.evil.ru/view/x')).toBe(true);
		expect(counts('https://discord.com.evil.ru/channels/1/2/3')).toBe(true);
	});
});

describe('censorDomain', () => {
	it('keepsOnlyTheDomainNameWithoutSubdomainsOrSuffix', () => {
		expect(censorDomain('https://free-nitro.ru/claim?x=1')).toBe('free-nitro');
		expect(censorDomain('https://www.steam-gift.com/login')).toBe('steam-gift');
		expect(censorDomain('http://login.steam-gift.com')).toBe('steam-gift');
		expect(censorDomain('HTTPS://LOGIN.Steam-Gift.COM')).toBe('steam-gift');
	});

	it('dropsMultiPartSuffixesWhole', () => {
		expect(censorDomain('https://shop.example.co.uk/a')).toBe('example');
		expect(censorDomain('https://x.com.ro')).toBe('x');
	});

	it('treatsPrivateSuffixesAsOrdinaryDomains', () => {
		expect(censorDomain('https://free-nitro.github.io/claim')).toBe('github');
	});

	it('showsIpAddressesAndBareHostsAsLink', () => {
		expect(censorDomain('http://192.168.0.1/x')).toBe('(link)');
		expect(censorDomain('http://[::1]/x')).toBe('(link)');
		expect(censorDomain('https://localhost:3000/x')).toBe('(link)');
	});
});

describe('censorLinks', () => {
	it('censorsEveryExampleInTheRequirements', () => {
		expect(censorLinks('https://free-nitro.ru/claim?x=1')).toBe('free-nitro');
		expect(censorLinks('https://www.steam-gift.com/login')).toBe('steam-gift');
		expect(censorLinks('http://login.steam-gift.com')).toBe('steam-gift');
		expect(censorLinks('[Claim here](https://free-nitro.ro/x)')).toBe('Claim here (free-nitro)');
		expect(censorLinks('discord.gg/AbC123')).toBe('discord');
		expect(censorLinks('http://192.168.0.1/x')).toBe('(link)');
	});

	it('keepsTheTextAroundLinks', () => {
		expect(censorLinks('Free nitro: https://free-nitro.ru/claim. Hurry, also <https://steam-gift.com/x>!')).toBe(
			'Free nitro: free-nitro. Hurry, also steam-gift!'
		);
	});

	it('censorsAUrlUsedAsAMaskedLinkLabel', () => {
		expect(censorLinks('[https://discord.com/safe](https://free-nitro.ru/x)')).toBe('discord (free-nitro)');
	});

	it('leavesTextWithoutLinksUnchanged', () => {
		expect(censorLinks('salut **tovarăși** @everyone')).toBe('salut **tovarăși** @everyone');
	});

	it('neverLeavesAWorkingUrlHostOrInviteCode', () => {
		const inputs = [
			'https://free-nitro.ru/claim?x=1',
			'https://www.steam-gift.com/login',
			'http://login.steam-gift.com',
			'[Claim here](https://free-nitro.ro/x)',
			'discord.gg/AbC123',
			'https://discord.com/invite/SeCrEt9',
			'http://192.168.0.1/x',
			'https://shop.example.co.uk/a/b',
			'x https://a.b.free-nitro.ru/p?q=1#f y [l](<https://steam-gift.com/z>) discord.gg/Code1.',
			'https://tenor.com/view/cat-123'
		];

		for (const input of inputs) {
			const output = censorLinks(input);
			expect(output, input).not.toMatch(/:\/\//);
			expect(output, input).not.toMatch(/\.(ru|ro|com|uk|gg)\b/);
			expect(output, input).not.toMatch(/AbC123|SeCrEt9|Code1|claim\?|\/login|cat-123/);
			expect(findLinks(output), input).toEqual([]);
		}
	});
});
