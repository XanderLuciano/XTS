export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Part id is required' })
  }
  return {
    pk: parseInt(id),
    name: `Part ${id}`,
    description: 'Sample part description',
    category: 'Electronics',
    stock: 100,
    location: 'Warehouse A'
  }
})
