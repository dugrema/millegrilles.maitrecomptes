import asyncio
import json
import logging

from typing import Optional

from millegrilles_messages.messages import Constantes
from millegrilles_web import Constantes as ConstantesWeb
from millegrilles_web.SocketIoHandler import SocketIoHandler
from server_maitrecomptes import Constantes as ConstantesMaitreComptes


class SocketIoMaitreComptesHandler(SocketIoHandler):

    def __init__(self, app, stop_event: asyncio.Event):
        self.__logger = logging.getLogger(__name__ + '.' + self.__class__.__name__)
        super().__init__(app, stop_event)

    async def _preparer_socketio_events(self):
        await super()._preparer_socketio_events()

        self._sio.on('getInfoUsager', handler=self.get_info_usager)
        self._sio.on('topologie/listeApplicationsDeployees', handler=self.requete_liste_applications_deployees)

        #       {eventName: 'getRecoveryCsr', callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'getRecoveryCsr', {params, cb})}},
        #       {eventName: 'signerRecoveryCsr', callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'signerRecoveryCsr', {params, cb})}},
        #       {eventName: 'getChallengeDelegation', callback: (params, cb) => { traiter(socket, mqdao.getChallengeDelegation, {params, cb}) }},
        #       {
        #         eventName: 'activerDelegationParCleMillegrille',
        #         callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'activerDelegationParCleMillegrille', {params, cb})}
        #       },

        # Listeners
        #       {eventName: 'ecouterEvenementsActivationFingerprint', callback: (params, cb) => {
        #         ecouterEvenementsActivationFingerprint(socket, params, cb)
        #       }},
        #       {eventName: 'retirerEvenementsActivationFingerprint', callback: (params, cb) => {
        #         retirerEvenementsActivationFingerprint(socket, params, cb)
        #       }},

    #     listenersPublics: [
    #       {eventName: 'authentifierCertificat', callback: async (params, cb) => {wrapCb(authentifierCertificat(socket, params), cb)}},
    #       {eventName: 'disconnect', callback: _ => {deconnexion(socket)}},
    #       {eventName: 'getInfoIdmg', callback: async (params, cb) => {wrapCb(getInfoIdmg(socket, params), cb)}},
    #       {eventName: 'upgrade', callback: async (params, cb) => {wrapCb(authentifierCertificat(socket, params), cb)}},
    #       {eventName: 'inscrireUsager', callback: async (params, cb) => {wrapCb(inscrire(socket, params), cb)}},
    #       // {eventName: 'ecouterFingerprintPk', callback: async (params, cb) => {wrapCb(ecouterFingerprintPk(socket, params), cb)}},
    #       {eventName: 'authentifierWebauthn', callback: async (params, cb) => {wrapCb(authentifierWebauthn(socket, params), cb)}},
    #       {eventName: 'authentifierCleMillegrille', callback: async (params, cb) => {wrapCb(authentifierCleMillegrille(socket, params), cb)}},
    #       {eventName: 'ajouterCsrRecovery', callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'ajouterCsrRecovery', {params, cb})}},
    #
    #       // Listeners evenements
    #       {eventName: 'ecouterEvenementsActivationFingerprint', callback: (params, cb) => {
    #         ecouterEvenementsActivationFingerprint(socket, params, cb)
    #       }},
    #       {eventName: 'retirerEvenementsActivationFingerprint', callback: (params, cb) => {
    #         retirerEvenementsActivationFingerprint(socket, params, cb)
    #       }},
    #
    #     ],
    #     listenersPrives: [
    #       {eventName: 'changerApplication', callback: (params, cb) => {changerApplication(socket, params, cb)}},
    #       {eventName: 'subscribe', callback: (params, cb) => {subscribe(socket, params, cb)}},
    #       {eventName: 'unsubscribe', callback: (params, cb) => {unsubscribe(socket, params, cb)}},
    #       {eventName: 'getCertificatsMaitredescles', callback: cb => {getCertificatsMaitredescles(socket, cb)}},
    #       {eventName: 'upgradeProteger', callback: async (params, cb) => {wrapCb(upgradeProteger(socket, params), cb)}},
    #     ],
    #     listenersProteges: [
    #       {eventName: 'challengeAjoutWebauthn', callback: async cb => {wrapCb(challengeAjoutWebauthn(socket), cb)}},
    #       {eventName: 'ajouterCleWebauthn', callback: async (params, cb) => {wrapCb(ajouterWebauthn(socket, params), cb)}},
    #       {eventName: 'sauvegarderCleDocument', callback: (params, cb) => {sauvegarderCleDocument(socket, params, cb)}},
    #       {eventName: 'topologie/listeApplicationsDeployees', callback: async (params, cb) => {wrapCb(listeApplicationsDeployees(socket, params), cb)}},
    #
    #       {eventName: 'getChallengeDelegation', callback: (params, cb) => { traiter(socket, mqdao.getChallengeDelegation, {params, cb}) }},
    #
    #       // {eventName: 'genererCertificatNavigateur', callback: async (params, cb) => {
    #       //   wrapCb(genererCertificatNavigateurWS(socket, params), cb)
    #       // }},
    #       {
    #         eventName: 'activerDelegationParCleMillegrille',
    #         callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'activerDelegationParCleMillegrille', {params, cb})}
    #       },
    #       {
    #         eventName: 'chargerCompteUsager',
    #         callback: async (params, cb) => {
    #           traiterCompteUsagersDao(socket, 'chargerCompteUsager', {params, cb})
    #         }
    #       },
    #       {eventName: 'getRecoveryCsr', callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'getRecoveryCsr', {params, cb})}},
    #       {eventName: 'signerRecoveryCsr', callback: async (params, cb) => {traiterCompteUsagersDao(socket, 'signerRecoveryCsr', {params, cb})}},
    #     ],

    @property
    def exchange_default(self):
        return ConstantesMaitreComptes.EXCHANGE_DEFAUT

    async def connect(self, sid: str, environ: dict):
        self.__logger.debug("connect %s", sid)
        try:
            request = environ.get('aiohttp.request')
            user_id = request.headers[ConstantesWeb.HEADER_USER_ID]
            user_name = request.headers[ConstantesWeb.HEADER_USER_NAME]
        except KeyError:
            self.__logger.debug("sio_connect SID:%s sans parametres request user_id/user_name (non authentifie)" % sid)
            return True

        async with self._sio.session(sid) as session:
            session[ConstantesWeb.SESSION_USER_NAME] = user_name
            session[ConstantesWeb.SESSION_USER_ID] = user_id

        return True

    async def executer_requete(self, sid: str, requete: dict, domaine: str, action: str, exchange: Optional[str] = None, producer=None, enveloppe=None):
        """ Override pour toujours verifier que l'usager a la delegation proprietaire """
        enveloppe = await self.etat.validateur_message.verifier(requete)
        if enveloppe.get_user_id is None:
            return {'ok': False, 'err': 'Acces refuse'}
        return await super().executer_requete(sid, requete, domaine, action, exchange, producer, enveloppe)

    async def executer_commande(self, sid: str, requete: dict, domaine: str, action: str, exchange: Optional[str] = None, producer=None, enveloppe=None):
        """ Override pour toujours verifier que l'usager a la delegation proprietaire """
        enveloppe = await self.etat.validateur_message.verifier(requete)
        if enveloppe.get_user_id is None:
            return {'ok': False, 'err': 'Acces refuse'}
        return await super().executer_commande(sid, requete, domaine, action, exchange, producer, enveloppe)

    # Instances
    async def get_info_usager(self, sid: str, message: dict):
        producer = await asyncio.wait_for(self.etat.producer_wait(), timeout=0.5)

        nom_usager = message['nomUsager']
        hostname = message['hostname']
        fingerprint_public_nouveau = message.get('fingerprintPublicNouveau')

        requete_usager = {'nomUsager': nom_usager, 'hostUrl': hostname}

        coros = list()

        coros.append(producer.executer_requete(
            requete_usager,
            domaine=Constantes.DOMAINE_CORE_MAITREDESCOMPTES, action='chargerUsager',
            exchange=Constantes.SECURITE_PRIVE
        ))

        if fingerprint_public_nouveau:
            requete_fingperint = {'fingerprint_pk': fingerprint_public_nouveau}
            coros.append(producer.executer_requete(
                requete_fingperint,
                domaine=Constantes.DOMAINE_CORE_PKI, action='certificatParPk',
                exchange=Constantes.SECURITE_PRIVE
            ))

        resultat = await asyncio.gather(*coros)

        compte_usager = resultat[0].parsed
        reponse_originale = compte_usager['__original']

        try:
            reponse_certificat = resultat[1]
            reponse_originale['attachements'] = {'certificat': reponse_certificat}
        except IndexError:
            pass  # OK

        return reponse_originale

    async def requete_liste_applications_deployees(self, sid: str, message: dict):
        return await self.executer_requete(sid, message, Constantes.DOMAINE_CORE_TOPOLOGIE, 'listeApplicationsDeployees')

    # Listeners

    # async def ecouter_presence_noeuds(self, sid: str, message: dict):
    #     "coupdoeil/ecouterEvenementsPresenceNoeuds"
    #     enveloppe = await self.etat.validateur_message.verifier(message)
    #     if enveloppe.get_delegation_globale != Constantes.DELEGATION_GLOBALE_PROPRIETAIRE:
    #         return {'ok': False, 'err': 'Acces refuse'}
    #
    #     exchanges = [Constantes.SECURITE_PUBLIC, Constantes.SECURITE_PRIVE, Constantes.SECURITE_PROTEGE]
    #     routing_keys = ['evenement.instance.presence']
    #     reponse = await self.subscribe(sid, message, routing_keys, exchanges, enveloppe=enveloppe)
    #     reponse_signee, correlation_id = self.etat.formatteur_message.signer_message(Constantes.KIND_REPONSE, reponse)
    #     return reponse_signee
    #
    # async def retirer_presence_noeuds(self, sid: str, message: dict):
    #     "coupdoeil/retirerEvenementsPresenceNoeuds"
    #     exchanges = [Constantes.SECURITE_PUBLIC, Constantes.SECURITE_PRIVE, Constantes.SECURITE_PROTEGE]
    #     routing_keys = ['evenement.instance.presence']
    #     reponse = await self.unsubscribe(sid, routing_keys, exchanges)
    #     reponse_signee, correlation_id = self.etat.formatteur_message.signer_message(Constantes.KIND_REPONSE, reponse)
    #     return reponse_signee