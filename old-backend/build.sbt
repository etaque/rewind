import NativePackagerHelper._

name := "rewind"
maintainer := "etaque@gmail.com"

scalaVersion := "2.13.3"

val http4sVersion = "0.21.7"
val circeVersion = "0.13.0"
val catsVersion = "2.1.1"
val catsEffectVersion = "2.1.4"
val doobieVersion = "0.9.0"
val tsecVersion = "0.2.1"

resolvers += Resolver.sbtPluginRepo("releases")

libraryDependencies ++= Seq(
  // http4s
  "org.http4s" %% "http4s-dsl" % http4sVersion,
  "org.http4s" %% "http4s-blaze-server" % http4sVersion,
  "org.http4s" %% "http4s-blaze-client" % http4sVersion,
  "org.http4s" %% "http4s-circe" % http4sVersion,
  // circe
  "io.circe" %% "circe-core" % circeVersion,
  "io.circe" %% "circe-generic" % circeVersion,
  "io.circe" %% "circe-generic-extras" % circeVersion,
  "io.circe" %% "circe-parser" % circeVersion,
  "io.circe" %% "circe-fs2" % circeVersion,
  // doobie
  "org.tpolecat" %% "doobie-core" % doobieVersion,
  "org.tpolecat" %% "doobie-postgres" % doobieVersion,
  "org.tpolecat" %% "doobie-hikari" % doobieVersion,
  "org.typelevel" %% "cats-core" % catsVersion,
  "org.typelevel" %% "cats-effect" % catsEffectVersion,
  // object storage
  "com.amazonaws" % "aws-java-sdk-s3" % "1.11.905",
  // shapeless
  "com.chuusai" %% "shapeless" % "2.4.0-M1", // Use an explicit version because implicit version 2.3.3 makes the compilation to hang indefinitely (investigated using -verbose in scalacOptions)
  // conf
  "com.github.pureconfig" %% "pureconfig" % "0.14.0",
  // logging
  "ch.qos.logback" % "logback-classic" % "1.2.3",
  "ch.qos.logback" % "logback-core" % "1.2.3",
  "org.slf4j" % "slf4j-api" % "1.7.25",
  // tests
  "io.monix" %% "minitest" % "2.8.2" % Test,
  "io.monix" %% "minitest-laws" % "2.8.2" % Test
)

testFrameworks += new TestFramework("minitest.runner.Framework")

scalacOptions ++= Seq(
  "-unchecked",
  "-deprecation",
  "-feature",
  "-Xlint:_,-byname-implicit", // Excluding -byname-implicit is required for Scala 2.13 due to https://github.com/scala/bug/issues/12072
  "-language:higherKinds",
  "-Ymacro-annotations" // for Circe `@ConfiguredJsonCodec` annotations
)

scalacOptions in Test ++= Seq("-Yrangepos")

// format on compilation

scalafmtOnCompile in ThisBuild := true

// packaging

enablePlugins(JavaAppPackaging)

mappings in Universal ++= contentOf("src/main/resources/db")

mappings in (Compile, packageDoc) := Seq() // Skip packageDoc task on stage

// version reader from git

enablePlugins(GitVersioning)

git.gitTagToVersionNumber := { tag: String =>
  if (tag matches "[0-9]+\\..*") Some(tag)
  else None
}

git.useGitDescribe := true

// to change suffix to `git-describe` in case of uncommited changes:
// git.uncommittedSignifier := Some("SNAPSHOT")

// expose version in app

enablePlugins(BuildInfoPlugin)

buildInfoKeys := Seq[BuildInfoKey](name, version, scalaVersion, sbtVersion)

buildInfoPackage := "rewind"

buildInfoOptions += BuildInfoOption.BuildTime

// Set default main class

mainClass in Compile := Some("rewind.App")

// Don’t add dev-init in dist
discoveredMainClasses in Compile := Seq()
