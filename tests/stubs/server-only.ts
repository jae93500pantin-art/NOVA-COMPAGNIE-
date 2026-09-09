/**
 * Remplace le paquet `server-only` pendant les tests.
 *
 * Le vrai module lève une erreur à l'import : c'est son but, empêcher qu'un
 * module serveur (client Supabase privilégié, brokers, persistance) atterrisse
 * dans un bundle navigateur. Vitest tourne en jsdom et déclencherait donc la
 * garde sur les modules mêmes qu'on veut tester. La protection reste assurée
 * là où elle compte : `next build` échoue si la frontière est franchie.
 */
export {};
