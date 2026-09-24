#!/usr/bin/env ruby
# frozen_string_literal: true

#
# Добавляет нативные модули приложения в проект Xcode.
#
# Результат работы скрипта уже зафиксирован в project.pbxproj, поэтому в
# обычной сборке запускать его не нужно. Скрипт нужен в одном случае: если
# платформенный проект пересоздан из шаблона React Native (например, при
# обновлении версии) — тогда он возвращает файлы модулей в цель сборки и
# настраивает заголовок моста Swift.
#
# Запуск:  cd ios && gem install xcodeproj && ruby setup-project.rb
#

require 'xcodeproj'

PROJECT_PATH = File.join(__dir__, 'PhotoNaPamyat.xcodeproj')
TARGET_NAME  = 'PhotoNaPamyat'
GROUP_NAME   = 'PhotoNaPamyat'

SOURCES = %w[
  PhotoKiosk.swift
  PhotoKiosk.m
  PhotoNetworkInfo.swift
  PhotoNetworkInfo.m
  PhotoSystemPrint.swift
  PhotoSystemPrint.m
].freeze

BRIDGING_HEADER = 'PhotoNaPamyat-Bridging-Header.h'

project = Xcodeproj::Project.open(PROJECT_PATH)
target  = project.targets.find { |t| t.name == TARGET_NAME }
abort "Не найдена цель сборки #{TARGET_NAME}" if target.nil?

group = project.main_group.find_subpath(GROUP_NAME, true)
group.set_source_tree('SOURCE_ROOT') if group.source_tree.nil?

added = []

(SOURCES + [BRIDGING_HEADER]).each do |name|
  relative = "#{GROUP_NAME}/#{name}"

  # Повторный запуск не должен плодить дубликаты ссылок.
  existing = group.files.find { |f| f.display_name == name }
  reference = existing || group.new_reference(relative)

  # В цель сборки идут только исходники; заголовок моста подключается
  # настройкой, а не фазой компиляции.
  next if name.end_with?('.h')

  already_built = target.source_build_phase.files_references.include?(reference)
  target.source_build_phase.add_file_reference(reference) unless already_built
  added << name unless already_built
end

target.build_configurations.each do |config|
  config.build_settings['SWIFT_OBJC_BRIDGING_HEADER'] = "#{GROUP_NAME}/#{BRIDGING_HEADER}"
  config.build_settings['SWIFT_VERSION'] = '5.0'
  # Планшет закреплён вертикально; ориентации задаёт Info.plist.
  config.build_settings['INFOPLIST_KEY_UIRequiresFullScreen'] = 'YES'
end

project.save

puts "Добавлено в цель сборки: #{added.empty? ? 'ничего нового' : added.join(', ')}"
puts "Заголовок моста: #{GROUP_NAME}/#{BRIDGING_HEADER}"
