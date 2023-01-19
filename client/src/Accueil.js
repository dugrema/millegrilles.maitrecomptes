import Applications from './Applications'

import {useEtatPret} from './WorkerContext'

function Accueil(props) {

    const { 
        setSectionAfficher,
        etatUsagerBackend, setEtatUsagerBackend,
        erreurCb, 
    } = props

    const etatPret = useEtatPret()

    if(!etatPret) return 'Accueil - Chargement en cours'

    return (
        <Applications 
            setSectionAfficher={setSectionAfficher} 
            etatUsagerBackend={etatUsagerBackend}
            setEtatUsagerBackend={setEtatUsagerBackend}
            erreurCb={erreurCb} 
          />
    )
}

export default Accueil
