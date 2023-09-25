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

        # self._sio.on('requeteListeNoeuds', handler=self.requete_liste_noeuds)

        # self._sio.on('ecouterEvenementsPresenceNoeuds', handler=self.ecouter_presence_noeuds)
        # self._sio.on('retirerEvenementsPresenceNoeuds', handler=self.retirer_presence_noeuds)

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
    # async def requete_liste_noeuds(self, sid: str, message: dict):
    #     return await self.executer_requete(sid, message, Constantes.DOMAINE_CORE_TOPOLOGIE, 'listeNoeuds')

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
