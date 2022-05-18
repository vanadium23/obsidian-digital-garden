import DigitalGardenSettings from './DigitalGardenSettings';
import { ButtonComponent, Modal, Notice, Setting, App, TAbstractFile, TFile } from 'obsidian';
import axios from "axios";
import { Octokit } from '@octokit/core';
import { Base64 } from 'js-base64';
import { arrayBufferToBase64 } from './utils';

export default class SettingView {
    private app: App;
    private settings: DigitalGardenSettings;
    private saveSettings: () => Promise<void>;
    private settingsRootElement: HTMLElement;
    private progressViewTop: HTMLElement;
    private loading: HTMLElement;
    private loadingInterval: any;

    constructor(app: App, settingsRootElement: HTMLElement, settings: DigitalGardenSettings, saveSettings: () => Promise<void>) {
        this.app = app;
        this.settingsRootElement = settingsRootElement;
        this.settings = settings;
        this.saveSettings = saveSettings;
    }

    async initialize(prModal: Modal) {
        this.settingsRootElement.empty();
        this.settingsRootElement.createEl('h2', { text: 'Settings ' });
        this.settingsRootElement.createEl('span', { text: 'Remember to read the setup guide if you haven\'t already. It can be found ' });
        this.settingsRootElement.createEl('a', { text: 'here.', href: "https://github.com/oleeskild/Obsidian-Digital-Garden" });


        this.initializeGitHubRepoSetting();
        this.initializeGitHubUserNameSetting();
        this.initializeGitHubTokenSetting();
        this.initializeGitHubBaseURLSetting();
        this.initializeDefaultNoteSettings();
        this.initializeThemesSettings();
		this.initializeRootFolderSetting();
        prModal.titleEl.createEl("h1", "Site template settings");
    }

    private async initializeDefaultNoteSettings() {
        const noteSettingsModal = new Modal(this.app);
        noteSettingsModal.titleEl.createEl("h1", { text: "Note Settings" });

        new Setting(this.settingsRootElement)
            .setName("Note Settings")
            .setDesc(`Default settings for each published note. These can be overwritten per note via frontmatter. 
            Note: After changing any of these settings, you must re-publish notes for it to take effect. They will appear in the "Changed" list in the publication center.`)
            .addButton(cb => {
                cb.setButtonText("Edit");
                cb.onClick(async () => {
                    noteSettingsModal.open();
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Show home link (dg-home-link)")
            .setDesc("Determines whether to show a link back to the homepage or not.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgHomeLink)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgHomeLink = val;
                    this.saveSettings();
                })
            })

        new Setting(noteSettingsModal.contentEl)
            .setName("Let all frontmatter through (dg-pass-frontmatter)")
            .setDesc("Determines whether to let all frontmatter data through to the site template. Be aware that this could break your site if you have data in a format not recognized by the template engine, 11ty.")
            .addToggle(t => {
                t.setValue(this.settings.defaultNoteSettings.dgPassFrontmatter)
                t.onChange((val) => {
                    this.settings.defaultNoteSettings.dgPassFrontmatter = val;
                    this.saveSettings();
                })
            })
    }


    private async initializeThemesSettings() {

        const themeModal = new Modal(this.app);
        themeModal.titleEl.createEl("h1", { text: "Appearance Settings" });

        new Setting(this.settingsRootElement)
            .setName("Appearance")
            .setDesc("Manage themes and favicons on your site")
            .addButton(cb => {
                cb.setButtonText("Manage");
                cb.onClick(async () => {
                    themeModal.open();
                })
            })

        const themesListResponse = await axios.get("https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-css-themes.json")
        new Setting(themeModal.contentEl)
            .setName("Theme")
            .addDropdown(dd => {
                dd.addOption('{"name": "default", "modes": ["dark"]}', "Default")
                const sortedThemes = themesListResponse.data.sort((a: { name: string; }, b: { name: any; }) => a.name.localeCompare(b.name));
                sortedThemes.map((x: any) => {
                    dd.addOption(JSON.stringify({ ...x, cssUrl: `https://raw.githubusercontent.com/${x.repo}/${x.branch || 'master'}/obsidian.css` }), x.name);
                    dd.setValue(this.settings.theme)
                    dd.onChange(async (val: any) => {
                        this.settings.theme = val;
                        await this.saveSettings();
                    });

                });
            })

        //should get theme settings from env in github, not settings
        new Setting(themeModal.contentEl)
            .setName("Base theme")
            .addDropdown(dd => {
                dd.addOption("dark", "Dark");
                dd.addOption("light", "Light");
                dd.setValue(this.settings.baseTheme)
                dd.onChange(async (val: string) => {
                    this.settings.baseTheme = val;
                    await this.saveSettings();
                });
            });

        new Setting(themeModal.contentEl)
            .setName("Favicon")
            .setDesc("Path to an svg in your vault you wish to use as a favicon. Leave blank to use default.")
            .addText(tc => {
                tc.setPlaceholder("myfavicon.svg")
                tc.setValue(this.settings.faviconPath);
                tc.onChange(async val => {
                    this.settings.faviconPath = val;
                    await this.saveSettings();
                });
            })


        new Setting(themeModal.contentEl)
            .addButton(cb => {
                cb.setButtonText("Apply settings to site");
                cb.onClick(async ev => {
                    const octokit = new Octokit({ auth: this.settings.githubToken });
                    await this.updateEnv(octokit);
                    await this.addFavicon(octokit);
                });
            })


    }
    private async updateEnv(octokit: Octokit) {
        const theme = JSON.parse(this.settings.theme);
        const baseTheme = this.settings.baseTheme;
        if (theme.modes.indexOf(baseTheme) < 0) {
            new Notice(`The ${theme.name} theme doesn't support ${baseTheme} mode.`)
            return;
        }

        let envSettings = '';
        if (theme.name !== 'default') {
            envSettings = `THEME=${theme.cssUrl}\nBASE_THEME=${baseTheme}`
        }
        const base64Settings = Base64.encode(envSettings);

        let fileExists = true;
        let currentFile = null;
        try {
            currentFile = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                path: ".env",
            });
        } catch (error) {
            fileExists = false;
        }

        //commit
        await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
            owner: this.settings.githubUserName,
            repo: this.settings.githubRepo,
            path: ".env",
            message: `Update theme`,
            content: base64Settings,
            sha: fileExists ? currentFile.data.sha : null
        });
        new Notice("Successfully applied theme");
    }

    private async addFavicon(octokit: Octokit) {
        let base64SettingsFaviconContent = "";
        if (this.settings.faviconPath) {

            const faviconFile = this.app.vault.getAbstractFileByPath(this.settings.faviconPath);
            if (!(faviconFile instanceof TFile)) {
                new Notice(`${this.settings.faviconPath} is not a valid file.`)
                return;
            }
            const faviconContent = await this.app.vault.readBinary(faviconFile);
            base64SettingsFaviconContent = arrayBufferToBase64(faviconContent);
        }
        else {
            const defaultFavicon = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: "oleeskild",
                repo: "digitalgarden",
                path: "src/site/favicon.svg"
            });
            base64SettingsFaviconContent = defaultFavicon.data.content;
        }

        //The getting and setting sha when putting can be generalized into a utility function
        let faviconExists = true;
        let faviconsAreIdentical = false;
        let currentFaviconOnSite = null;
        try {
            currentFaviconOnSite = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                path: "src/site/favicon.svg",
            });
            faviconsAreIdentical = (currentFaviconOnSite.data.content.replaceAll("\n", "").replaceAll(" ", "") === base64SettingsFaviconContent)
        } catch (error) {
            faviconExists = false;
        }

        if (!faviconExists || !faviconsAreIdentical) {
            await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner: this.settings.githubUserName,
                repo: this.settings.githubRepo,
                path: "src/site/favicon.svg",
                message: `Update favicon.svg`,
                content: base64SettingsFaviconContent,
                sha: faviconExists ? currentFaviconOnSite.data.sha : null
            });

            new Notice(`Successfully set new favicon`)
        }

    }
    private initializeGitHubRepoSetting() {
        new Setting(this.settingsRootElement)
            .setName('GitHub repo name')
            .setDesc('The name of the GitHub repository')
            .addText(text => text
                .setPlaceholder('mydigitalgarden')
                .setValue(this.settings.githubRepo)
                .onChange(async (value) => {
                    this.settings.githubRepo = value;
                    await this.saveSettings();
                }));

    }

    private initializeRootFolderSetting() {
        new Setting(this.settingsRootElement)
            .setName('Root Folder')
            .setDesc('This folder will be treated as root (trim in URL)')
            .addText(text => text
                .setPlaceholder('some/folder')
                .setValue(this.settings.rootFolder)
                .onChange(async (value) => {
					let rootFolder = value;
					if (rootFolder.endsWith("/")) {
						rootFolder = rootFolder.substring(0, rootFolder.length-1);
					}
                    this.settings.rootFolder = rootFolder;
                    await this.saveSettings();
                }));

    }

    private initializeGitHubUserNameSetting() {
        new Setting(this.settingsRootElement)
            .setName('GitHub Username')
            .setDesc('Your GitHub Username')
            .addText(text => text
                .setPlaceholder('myusername')
                .setValue(this.settings.githubUserName)
                .onChange(async (value) => {
                    this.settings.githubUserName = value;
                    await this.saveSettings();
                }));

    }

    private initializeGitHubTokenSetting() {
        const desc = document.createDocumentFragment();
        desc.createEl("span", null, (span) => {
            span.innerText =
                "A GitHub token with repo permissions. You can generate it ";
            span.createEl("a", null, (link) => {
                link.href = "https://github.com/settings/tokens/new?scopes=repo";
                link.innerText = "here!";
            });
        });

        new Setting(this.settingsRootElement)
            .setName('GitHub token')
            .setDesc(desc)
            .addText(text => text
                .setPlaceholder('Secret Token')
                .setValue(this.settings.githubToken)
                .onChange(async (value) => {
                    this.settings.githubToken = value;
                    await this.saveSettings();
                }));

    }

    private initializeGitHubBaseURLSetting() {
        new Setting(this.settingsRootElement)
            .setName('Base URL')
            .setDesc(`
            This is used for the "Copy Note URL" command and is optional. 
            If you leave it blank, the plugin will try to guess it from the repo name.
            `)
            .addText(text => text
                .setPlaceholder('my-garden.netlify.app')
                .setValue(this.settings.gardenBaseUrl)
                .onChange(async (value) => {
                    this.settings.gardenBaseUrl = value;
                    await this.saveSettings();
                }));
    }

    renderCreatePr(modal: Modal, handlePR: (button: ButtonComponent) => Promise<void>) {

        new Setting(this.settingsRootElement)
            .setName("Site Template")
            .setDesc("Manage updates to the base template. You should try updating the template when you update the plugin to make sure your garden support all features.")
            .addButton(button => {
                button.setButtonText("Manage site template")
                button.onClick(() => {
                    modal.open();
                })
            })
        new Setting(modal.contentEl)
            .setName('Update site to latest template')
            .setDesc(`
				This will create a pull request with the latest template changes, which you'll need to use all plugin features. 
				It will not publish any changes before you approve them.
				You can even test the changes first as Netlify will automatically provide you with a test URL.
			`)
            .addButton(button => button
                .setButtonText('Create PR')
                .onClick(() => handlePR(button)));

        if (!this.progressViewTop) {
            this.progressViewTop = modal.contentEl.createEl('div', {});
        }
        if (!this.loading) {
            this.loading = modal.contentEl.createEl('div', {});
            this.loading.hide();
        }
    }

    renderPullRequestHistory(modal: Modal, previousPrUrls: string[]) {
        if (previousPrUrls.length === 0) {
            return;
        }
        const header = modal.contentEl.createEl('h2', { text: '➕ Recent Pull Request History' })
        const prsContainer = modal.contentEl.createEl('ul', {});
        prsContainer.hide();
        header.onClickEvent(() => {
            if (prsContainer.isShown()) {
                prsContainer.hide();
                header.textContent = "➕  Recent Pull Request History";
            } else {
                prsContainer.show();
                header.textContent = "➖ Recent Pull Request History";
            }
        })
        previousPrUrls.map(prUrl => {
            const li = prsContainer.createEl('li', { attr: { 'style': 'margin-bottom: 10px' } });
            const prUrlElement = document.createElement('a');
            prUrlElement.href = prUrl;
            prUrlElement.textContent = prUrl;
            li.appendChild(prUrlElement);
        });
    };

    renderLoading() {
        this.loading.show();
        const text = "Creating PR. This should take less than 1 minute";
        const loadingText = this.loading.createEl('h2', { text });
        this.loadingInterval = setInterval(() => {
            if (loadingText.innerText === `${text}`) {
                loadingText.innerText = `${text}.`;
            } else if (loadingText.innerText === `${text}.`) {
                loadingText.innerText = `${text}..`;
            } else if (loadingText.innerText === `${text}..`) {
                loadingText.innerText = `${text}...`;
            } else {
                loadingText.innerText = `${text}`;
            }
        }, 400)
    }

    renderSuccess(prUrl: string) {
        this.loading.remove();
        clearInterval(this.loadingInterval);

        const successmessage = prUrl ?
            { text: `🎉 Done! Approve your PR to make the changes go live.` } :
            { text: "You already have the latest template 🎉 No need to create a PR.", attr: {} };
        const linkText = { text: `${prUrl}`, href: prUrl };
        this.progressViewTop.createEl('h2', successmessage);
        if (prUrl) {
            this.progressViewTop.createEl('a', linkText);
        }
        this.progressViewTop.createEl('br');
    }

    renderError() {
        this.loading.remove();
        clearInterval(this.loadingInterval);
        const errorMsg = { text: '❌ Something went wrong. Try deleting the branch in GitHub.', attr: {} };
        this.progressViewTop.createEl('p', errorMsg);
    }
}
