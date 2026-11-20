# Keep legacy GitHub Pages intact while the Cloudflare build publishes only code.
# App assets deploy independently; encrypted reports and videos are imported to R2.
Jekyll::Hooks.register :site, :post_read do |site|
  next unless ENV['NIR_CLOUDFLARE'] == '1'
  external = %r{\A/?(?:research(?:/|$)|fitness(?:/|$)|flats(?:/|$)|assets/video/|talks/[^/]+/video/)}
  site.static_files.reject! { |file| file.relative_path.match?(external) }
  site.pages.reject! { |page| page.path.match?(external) }
end
