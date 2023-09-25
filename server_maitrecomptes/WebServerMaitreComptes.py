import logging

from millegrilles_web.WebServer import WebServer

from server_maitrecomptes import Constantes as ConstantesMaitreComptes
from server_maitrecomptes.SocketIoMaitreComptesHandler import SocketIoMaitreComptesHandler


class WebServerMaitreComptes(WebServer):

    def __init__(self, etat, commandes):
        self.__logger = logging.getLogger(__name__ + '.' + self.__class__.__name__)
        super().__init__(ConstantesMaitreComptes.WEBAPP_PATH, etat, commandes)

    def get_nom_app(self) -> str:
        return ConstantesMaitreComptes.APP_NAME

    async def setup_socketio(self):
        """ Wiring socket.io """
        # Utiliser la bonne instance de SocketIoHandler dans une sous-classe
        self._socket_io_handler = SocketIoMaitreComptesHandler(self, self._stop_event)
        await self._socket_io_handler.setup()

    async def _preparer_routes(self):
        self.__logger.info("Preparer routes WebServerCoupdoeil sous /coupdoeil")
        await super()._preparer_routes()
