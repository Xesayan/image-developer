export const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = vec2((a_position.x + 1.0) / 2.0, 1.0 - (a_position.y + 1.0) / 2.0);
  }
`;

export const FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D u_image;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  varying vec2 v_texCoord;

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    
    // 1. Brightness
    color.rgb += u_brightness;
    
    // 2. Contrast
    color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;
    
    // 3. Colorfulness (Saturation)
    float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    color.rgb = mix(vec3(luminance), color.rgb, u_saturation);
    
    gl_FragColor = clamp(color, 0.0, 1.0);
  }
`;