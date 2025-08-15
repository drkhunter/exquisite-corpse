export const useIdentity = () => {
    const ID_KEY = 'xc_uid'
    const NAME_KEY = 'xc_name'
    let id = localStorage.getItem(ID_KEY)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(ID_KEY, id) }
    const name = ref<string>(localStorage.getItem(NAME_KEY) || 'Guest')
    function setName(n: string) { name.value = n || 'Guest'; localStorage.setItem(NAME_KEY, name.value) }
    return { id, name, setName }
}
