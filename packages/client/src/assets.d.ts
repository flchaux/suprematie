// Imports de fichiers par URL (Vite : `import url from "./fichier.mp3?url"`).
declare module "*?url" {
  const url: string;
  export default url;
}
