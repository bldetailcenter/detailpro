async function subirFoto(e, id, col) {
  const file = e.target.files[0];
  if(!file) return;
  
  showToast('Subiendo imagen...', 'success');
  
  // Generamos un nombre único
  const fileExt = file.name.split('.').pop();
  const fileName = `${id}_${col}_${Date.now()}.${fileExt}`;

  // SUBIDA CON FORMATO FORZADO
  const { error: uploadError } = await db.storage
    .from('fotos_vehiculos')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type // Esto ayuda a que el navegador la reconozca luego
    });

  if (uploadError) {
    console.error("Error subiendo:", uploadError);
    showToast('Error al subir a Supabase', 'error');
    return;
  }

  // OBTENER URL
  const { data: { publicUrl } } = db.storage
    .from('fotos_vehiculos')
    .getPublicUrl(fileName);

  // GUARDAR EN BASE DE DATOS
  const { error: dbError } = await db
    .from('intervenciones')
    .update({ [col]: publicUrl })
    .eq('id', id);

  if (dbError) {
    showToast('Error al guardar el enlace', 'error');
    return;
  }

  showToast('✓ Imagen guardada');
  verIntervencion(id); // Recargamos para ver la miniatura
}
