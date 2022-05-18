export default interface DigitalGardenSettings {
	githubToken: string;
	githubRepo: string;
	githubUserName: string;
	gardenBaseUrl: string;
	rootFolder: string;
	prHistory: string[];

	theme: string;
	baseTheme: string;
	faviconPath: string;


	defaultNoteSettings: {
		dgHomeLink: boolean;
		dgPassFrontmatter: boolean;
	}
}
