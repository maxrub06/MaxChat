# MaxChat

Responsiv chattprototyp med direktmeddelanden, grupper, emoji-reaktioner, filsval och sökning. Gränssnittet är byggt med HTML, JavaScript och Tailwind CSS.

Installera beroenden med `npm install` och starta sedan appen med `npm start`. Öppna `http://localhost:3000` i webbläsaren. Tailwind CSS hämtas från CDN, så internetanslutning behövs. Konversationer sparas lokalt i webbläsarens `localStorage`.

Samtal använder WebRTC för ljud och MaxChats server för signalering. Båda deltagarna behöver öppna appen via samma serveradress och tillåta mikrofonåtkomst. `file://` och fristående statiska servrar stöder inte samtal.

**Begränsning:** MySQL, användarkonton, synkronisering av meddelanden mellan användare och faktisk filuppladdning är inte anslutna ännu. Filsvalet visar filnamn och storlek i konversationen; det laddar inte upp filinnehållet.