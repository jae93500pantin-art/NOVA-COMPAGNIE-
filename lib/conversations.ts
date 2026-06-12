import type { Conversation } from "./types";

export const conversations: Conversation[] = [
  {
    id: "c1",
    driverId: "alexandre-moreau",
    lastMessage: "Parfait, je serai devant le terminal 2E à 14h précises.",
    time: "14:02",
    unread: 2,
    messages: [
      { id: "m1", fromMe: true, text: "Bonjour Alexandre, êtes-vous disponible demain pour un transfert depuis CDG ?", time: "13:40", read: true },
      { id: "m2", fromMe: false, text: "Bonjour ! Oui avec plaisir. À quelle heure atterrissez-vous ?", time: "13:44", read: true },
      { id: "m3", fromMe: true, text: "Vol AF1234, arrivée prévue à 13h50 au terminal 2E.", time: "13:51", read: true },
      { id: "m4", fromMe: false, text: "Parfait, je serai devant le terminal 2E à 14h précises.", time: "14:02", read: false },
    ],
  },
  {
    id: "c2",
    driverId: "david-chen",
    lastMessage: "Sounds great, I'll bring the Escalade. See you Monday!",
    time: "Hier",
    unread: 0,
    messages: [
      { id: "m1", fromMe: true, text: "Hi David, I need a driver for 3 days of meetings next week.", time: "10:02", read: true },
      { id: "m2", fromMe: false, text: "Absolutely. I can do Monday to Wednesday, full days. Which area?", time: "10:10", read: true },
      { id: "m3", fromMe: true, text: "Mostly Midtown and Wall Street. Early starts around 7am.", time: "10:15", read: true },
      { id: "m4", fromMe: false, text: "Sounds great, I'll bring the Escalade. See you Monday!", time: "10:18", read: true },
    ],
  },
  {
    id: "c3",
    driverId: "sofia-romano",
    lastMessage: "Genial, nos vemos en el aeropuerto 😊",
    time: "Lun",
    unread: 0,
    messages: [
      { id: "m1", fromMe: true, text: "Hola Sofia, ¿libre el sábado para El Prat?", time: "18:20", read: true },
      { id: "m2", fromMe: false, text: "¡Hola! Sí, sin problema. ¿A qué hora?", time: "18:25", read: true },
      { id: "m3", fromMe: true, text: "Vuelo a las 11, recogida sobre las 8:30.", time: "18:30", read: true },
      { id: "m4", fromMe: false, text: "Genial, nos vemos en el aeropuerto 😊", time: "18:33", read: true },
    ],
  },
];
