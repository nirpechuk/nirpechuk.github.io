# Derive the explorer's public pages from rendered pages that actually track views.
# Private report titles are supplied only by the decrypted research manifest.
Jekyll::Hooks.register :site, :post_render do |site|
  pages = (site.pages + site.documents).select do |page|
    page.output && page.output.include?('data-page-views') && page.url != '/404.html'
  end.map do |page|
    { 'path' => page.url, 'title' => page.data['title'].to_s.empty? ? page.url : page.data['title'].to_s }
  end.uniq { |page| page['path'] }.sort_by { |page| page['path'] }
  catalog = Jekyll::PageWithoutAFile.new(site, site.source, 'assets', 'analytics-pages.json')
  catalog.content = JSON.generate(pages)
  catalog.output = catalog.content
  catalog.data['layout'] = nil
  site.pages << catalog
end
