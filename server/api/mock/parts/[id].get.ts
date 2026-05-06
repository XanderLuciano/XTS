export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  return {
    pk: parseInt(id),
    name: `Part ${id}`,
    description: 'Sample part description',
    category: 'Electronics',
    stock: 100,
    location: 'Warehouse A'
  }
})
