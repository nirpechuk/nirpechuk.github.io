// A 3D splat predicted from the single website photo by Apple's SHARP model,
// with the background removed. Real relief on the face, but only what the photo
// shows: there is no back of the head, so it must stay roughly front-on.
// Coordinates are the model's camera frame: x right, y down, z away, in metres.
export const PHOTO = {
  url: "photo-3d.ply",
  rotation: [Math.PI, 0, 0], // flip to y up, facing the camera (+z)
  centre: [0, 0, 1.57], // y = 0 is the height of the camera that took the photo
  size: 0.42, // dissolve page: metres of the figure that fill the frame (smaller = closer)
  cut: 0.29, // dissolve page: where the figure's bottom edge appears, below `centre`
  tilt: 0.09, // dissolve page: nod the head forward a little; the closer camera there looks up at it
  above: 0.265, // top of the hair above `centre`
  below: 0.347, // bottom of the crop below `centre`
  height: 2.25, // world height to draw it at
  base: -0.85, // world height of the bottom of the crop: lower sits lower on the page
};
