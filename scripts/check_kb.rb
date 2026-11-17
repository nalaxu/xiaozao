require 'yaml'
dir = ARGV[0] || File.expand_path("../knowledge", __dir__)
errors = []
flavors = YAML.load_file("#{dir}/flavors.yaml")['flavors']
scenes = YAML.load_file("#{dir}/scenes.yaml")['scenes']
ings = YAML.load_file("#{dir}/ingredients.yaml")['ingredients']
fids = flavors.map { |f| f['id'] }
sids = scenes.map { |s| s['id'] }
inames = ings.map { |i| i['zh'] }
dup = inames.group_by(&:itself).select { |_, v| v.size > 1 }.keys
errors << "食材重名: #{dup}" unless dup.empty?
cuisines = Dir["#{dir}/cuisines/*.yaml"].sort.map { |f| [File.basename(f, '.yaml'), YAML.load_file(f)] }
cids = cuisines.map { |n, c| errors << "#{n}: id 与文件名不一致" if c['id'] != n; c['id'] }
flavors.each { |f| (f['cuisines'] - cids).each { |x| errors << "flavors #{f['id']}: 未知菜系 #{x}" } }
total = 0
cuisines.each do |n, c|
  %w[overview flavor_tags flavor_profiles core_seasonings techniques common_ingredients representative_dishes overseas].each do |k|
    errors << "#{n}: 缺少 #{k}" if c[k].nil? || c[k].empty?
  end
  (c['flavor_tags'] - fids).each { |x| errors << "#{n}: 未知味型 #{x}" }
  (c['common_ingredients'] - inames).each { |x| errors << "#{n}: 食材词典缺少 #{x}" }
  c['representative_dishes'].each do |d|
    total += 1
    %w[zh en key flavors difficulty].each { |k| errors << "#{n}/#{d['zh']}: 缺少 #{k}" if d[k].nil? }
    (d['flavors'] - fids).each { |x| errors << "#{n}/#{d['zh']}: 未知味型 #{x}" }
    ((d['scenes'] || []) - sids).each { |x| errors << "#{n}/#{d['zh']}: 未知场景 #{x}" }
    errors << "#{n}/#{d['zh']}: 难度应为 1-3" unless [1, 2, 3].include?(d['difficulty'])
  end
  # 菜系 flavor_tags 与 flavors.yaml 的 cuisines 映射是否双向一致
  c['flavor_tags'].each { |t| f = flavors.find { |x| x['id'] == t }; errors << "#{n}: 标了 #{t}，但 flavors.yaml 的 #{t} 未列此菜系" if f && !f['cuisines'].include?(n) }
  flavors.each { |f| errors << "#{n}: flavors.yaml 的 #{f['id']} 列了此菜系，但菜系条目未标" if f['cuisines'].include?(n) && !c['flavor_tags'].include?(f['id']) }
end
# 每个场景、每个味型至少有几道代表菜
all = cuisines.flat_map { |_, c| c['representative_dishes'] }
fids.each { |f| cnt = all.count { |d| d['flavors'].include?(f) }; puts "味型 #{f}: #{cnt} 道" }
sids.each { |s| cnt = all.count { |d| (d['scenes'] || []).include?(s) }; puts "场景 #{s}: #{cnt} 道" }
puts "菜系 #{cuisines.size} 个，代表菜 #{total} 道，食材 #{inames.size} 个"
puts errors.empty? ? "检查通过" : errors.map { |e| "错误: #{e}" }
