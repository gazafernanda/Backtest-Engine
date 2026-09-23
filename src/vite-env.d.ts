/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Free key from https://twelvedata.com/apikey — see .env.example */
    readonly VITE_TWELVEDATA_API_KEY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
