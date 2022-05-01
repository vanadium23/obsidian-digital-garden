export default interface DigitalGardenSettings {
	githubToken: string;
	githubRepo: string;
	githubUserName: string;
	githubRepoNotesPath: string;
	gardenBaseUrl: string;
	prHistory: string[];

	theme: string;
	baseTheme: string;
	faviconPath: string;


	defaultNoteSettings: {
		dgHomeLink: boolean;
		dgPassFrontmatter: boolean;
	}
}
