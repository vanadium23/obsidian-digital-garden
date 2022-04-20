import { MetadataCache } from "obsidian";

export interface IFrontMatterEngine{
    set(key: string, value: string|boolean|number): IFrontMatterEngine;
    get(key: string): string|boolean|number);
    apply(): boolean;
}

export default class ObsidianFrontMatterSettings implements IFrontMatterEngine {

    metadataCache: MetadataCache;
    filePath: string;
    generatedFrontMatter: {} = {};

    constructor(metadataCache: MetadataCache, filePath: string){
        this.metadataCache = metadataCache; 
        this.filePath = filePath;
    }

    set(key: string, value: string|boolean|number): ObsidianFrontMatterSettings {
        this.generatedFrontMatter[key] = value;
        return this;
    }

    get(key: string): string|boolean|number: ObsidianFrontMatterSettings {
        this.getFrontMatterSnapshot()[key];
        return this;
    }

    apply(): boolean {
        const newFrontMatter = this.getFrontMatterSnapshot();
        console.log(newFrontMatter);
        //Convert to yaml string
        //Write to file
        return true;
    }

    private getFrontMatterSnapshot(){
        return {...this.metadataCache.getCache(this.filePath)?.frontmatter, ...this.generatedFrontMatter};
    }

     
}
